import { Aspects, Duration, type IAspect } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import {
  NodejsFunction,
  type NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import {
  NagSuppressions,
  type NagPackSuppression,
  type NagPackSuppressionAppliesTo,
} from 'cdk-nag';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Construct, type IConstruct } from 'constructs';
import { POWERTOOLS_METRICS_NAMESPACE } from '../config/constants.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Monorepo root (`package-lock.json`, service entrypoints). */
export const REPO_ROOT = join(__dirname, '../../..');

/** Default esbuild externals: rely on the Lambda Node.js AWS SDK v3 runtime. */
export const DEFAULT_EXTERNAL_MODULES = ['@aws-sdk/*'] as const;

export interface NodeLambdaProps extends Omit<
  NodejsFunctionProps,
  | 'runtime'
  | 'architecture'
  | 'tracing'
  | 'logGroup'
  | 'depsLockFilePath'
  | 'projectRoot'
> {
  readonly powertoolsServiceName: string;
  readonly alertsTopic: ITopic;
  readonly alarmNamePrefix: string;
  readonly iam5NagReason: string;
  readonly iam5NagAppliesTo: NagPackSuppressionAppliesTo[];
  readonly logRetention?: RetentionDays;
  readonly enableDurationAlarm?: boolean;
}

export interface LambdaFailureDestinationProps {
  readonly alertsTopic: ITopic;
  readonly depthAlarmName: string;
  readonly queueName?: string;
  readonly retentionPeriod?: Duration;
}

/**
 * SQS on-failure destination for Lambda stream event sources and async
 * invokes, plus an alarm that re-notifies when new messages are sent.
 */
export class LambdaFailureDestination extends Construct {
  readonly queue: Queue;
  readonly streamDestination: SqsDlq;
  readonly asyncDestination: SqsDestination;
  readonly depthAlarm: Alarm;

  constructor(
    scope: Construct,
    id: string,
    props: LambdaFailureDestinationProps,
  ) {
    super(scope, id);

    this.queue = new Queue(this, 'Queue', {
      queueName: props.queueName,
      retentionPeriod: props.retentionPeriod ?? Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    this.streamDestination = new SqsDlq(this.queue);
    this.asyncDestination = new SqsDestination(this.queue);

    this.depthAlarm = new Alarm(this, 'DepthAlarm', {
      alarmName: props.depthAlarmName,
      alarmDescription:
        'Lambda failure destination received a message (discarded stream/async record). Republish then purge — see RUNBOOK.',
      metric: this.queue.metricNumberOfMessagesSent({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    this.depthAlarm.addAlarmAction(new SnsAction(props.alertsTopic));

    NagSuppressions.addResourceSuppressions(
      this.queue,
      [
        {
          id: 'AwsSolutions-SQS3',
          reason:
            'Queue is itself the on-failure destination for a Lambda event source; nesting another DLQ is not useful.',
        },
      ],
      true,
    );
  }
}

/**
 * Shared Node.js Lambda. Errors alarm id is `${id without Function}LambdaErrors`
 * at stack scope (ApiFunction → ApiLambdaErrors).
 */
export class NodeLambda extends NodejsFunction {
  readonly errorsAlarm: Alarm;
  readonly throttlesAlarm: Alarm;
  readonly durationAlarm?: Alarm;

  constructor(scope: Construct, id: string, props: NodeLambdaProps) {
    const {
      powertoolsServiceName,
      alertsTopic,
      alarmNamePrefix,
      iam5NagReason,
      iam5NagAppliesTo,
      logRetention = RetentionDays.TWO_WEEKS,
      enableDurationAlarm = false,
      environment,
      bundling,
      timeout,
      ...rest
    } = props;

    const baseId = id.replace(/Function$/, '');

    const logGroup = new LogGroup(scope, `${baseId}LogGroup`, {
      retention: logRetention,
    });

    super(scope, id, {
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      tracing: Tracing.ACTIVE,
      logGroup,
      depsLockFilePath: join(REPO_ROOT, 'package-lock.json'),
      projectRoot: REPO_ROOT,
      timeout,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node24',
        externalModules: [...DEFAULT_EXTERNAL_MODULES],
        ...bundling,
      },
      environment: {
        POWERTOOLS_SERVICE_NAME: powertoolsServiceName,
        POWERTOOLS_METRICS_NAMESPACE,
        NODE_OPTIONS: '--enable-source-maps',
        ...environment,
      },
      ...rest,
    });

    this.errorsAlarm = new Alarm(scope, `${baseId}LambdaErrors`, {
      alarmName: `${alarmNamePrefix}-lambda-errors`,
      alarmDescription: `${powertoolsServiceName} Lambda errors > 0 in 5 minutes`,
      metric: this.metricErrors({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    this.errorsAlarm.addAlarmAction(new SnsAction(alertsTopic));

    this.throttlesAlarm = new Alarm(scope, `${id}ThrottlesAlarm`, {
      alarmName: `${alarmNamePrefix}-lambda-throttles`,
      alarmDescription: `${powertoolsServiceName} Lambda throttles > 0 in 5 minutes`,
      metric: this.metricThrottles({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    this.throttlesAlarm.addAlarmAction(new SnsAction(alertsTopic));

    if (enableDurationAlarm && timeout) {
      const thresholdMs = Math.floor(timeout.toMilliseconds() * 0.8);
      this.durationAlarm = new Alarm(scope, `${id}DurationAlarm`, {
        alarmName: `${alarmNamePrefix}-lambda-duration`,
        alarmDescription: `${powertoolsServiceName} Lambda p99 duration ≥ 80% of timeout`,
        metric: this.metricDuration({
          period: Duration.minutes(5),
          statistic: 'p99',
        }),
        threshold: thresholdMs,
        evaluationPeriods: 1,
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      this.durationAlarm.addAlarmAction(new SnsAction(alertsTopic));
    }

    const nagSuppressions: NagPackSuppression[] = [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'NodejsFunction uses AWSLambdaBasicExecutionRole for CloudWatch Logs.',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: iam5NagReason,
        appliesTo: iam5NagAppliesTo,
      },
    ];
    Aspects.of(this).add(new ApplyNodeLambdaNagSuppressions(nagSuppressions), {
      priority: 100,
    });
  }
}

class ApplyNodeLambdaNagSuppressions implements IAspect {
  constructor(private readonly suppressions: NagPackSuppression[]) {}

  visit(node: IConstruct): void {
    if (node instanceof NodeLambda) {
      NagSuppressions.addResourceSuppressions(node, this.suppressions, true);
    }
  }
}
