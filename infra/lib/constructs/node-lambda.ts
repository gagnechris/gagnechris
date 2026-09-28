import { Aspects, Duration, type IAspect, type CfnResource } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import {
  NodejsFunction,
  type NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { NagSuppressions, type NagPackSuppression } from 'cdk-nag';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Construct, type IConstruct } from 'constructs';
import { POWERTOOLS_METRICS_NAMESPACE } from '../config/constants.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Monorepo root (`package-lock.json`, service entrypoints). */
export const REPO_ROOT = join(__dirname, '../../..');

/** Default esbuild externals: rely on the Lambda Node.js AWS SDK v3 runtime. */
export const DEFAULT_EXTERNAL_MODULES = ['@aws-sdk/*'] as const;

export interface NodeLambdaProps
  extends Omit<
    NodejsFunctionProps,
    | 'runtime'
    | 'architecture'
    | 'tracing'
    | 'logGroup'
    | 'depsLockFilePath'
    | 'projectRoot'
  > {
  /**
   * POWERTOOLS_SERVICE_NAME (and alarm dimension context).
   * Metrics namespace is always {@link POWERTOOLS_METRICS_NAMESPACE}.
   */
  readonly powertoolsServiceName: string;
  /** SNS topic for errors / throttles / optional duration alarms. */
  readonly alertsTopic: ITopic;
  /**
   * Prefix for CloudWatch alarm names, e.g. `gagnechris-prod-api`
   * → `…-lambda-errors`, `…-lambda-throttles`.
   */
  readonly alarmNamePrefix: string;
  /**
   * Preserve an existing CloudWatch alarm logical ID when migrating onto
   * NodeLambda (same AlarmName; avoids "already exists" on CFN replace).
   */
  readonly errorsAlarmLogicalId?: string;
  /**
   * cdk-nag AwsSolutions-IAM5 reason (X-Ray + stack-specific wildcards).
   * IAM4 (AWSLambdaBasicExecutionRole) is suppressed with a fixed reason.
   */
  readonly iam5NagReason: string;
  /** @default RetentionDays.TWO_WEEKS */
  readonly logRetention?: RetentionDays;
  /** When true, alarm if p99 duration exceeds 80% of the function timeout. */
  readonly enableDurationAlarm?: boolean;
}

export interface LambdaFailureDestinationProps {
  readonly alertsTopic: ITopic;
  /**
   * CloudWatch alarm name for ApproximateNumberOfMessagesVisible ≥ 1.
   */
  readonly depthAlarmName: string;
  /** Optional explicit queue name (useful for ops / SSM). */
  readonly queueName?: string;
  /** @default Duration.days(14) */
  readonly retentionPeriod?: Duration;
}

/**
 * SQS destination for discarded Lambda stream / async records, plus a depth alarm.
 * Use with `DynamoEventSource` / `KinesisEventSource` `onFailure`.
 */
export class LambdaFailureDestination extends Construct {
  readonly queue: Queue;
  readonly destination: SqsDlq;
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

    this.destination = new SqsDlq(this.queue);

    this.depthAlarm = new Alarm(this, 'DepthAlarm', {
      alarmName: props.depthAlarmName,
      alarmDescription:
        'Lambda failure destination has visible messages (discarded stream/async records)',
      metric: this.queue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    this.depthAlarm.addAlarmAction(new SnsAction(props.alertsTopic));

    // This queue *is* the DLQ for stream failures; it does not need its own DLQ.
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
 * Shared Node.js Lambda: arm64, X-Ray, log retention, esbuild defaults,
 * Powertools env, standard alarms, and documented cdk-nag suppressions.
 *
 * Extends {@link NodejsFunction} so stack construct IDs (`ApiFunction`,
 * `PublisherFunction`) keep stable CloudFormation logical IDs for the function.
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
      errorsAlarmLogicalId,
      iam5NagReason,
      logRetention = RetentionDays.TWO_WEEKS,
      enableDurationAlarm = false,
      environment,
      bundling,
      timeout,
      ...rest
    } = props;

    const logGroup = new LogGroup(
      scope,
      // Preserve prior sibling IDs (ApiLogGroup / PublisherLogGroup).
      `${id.replace(/Function$/, '')}LogGroup`,
      {
        retention: logRetention,
      },
    );

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

    this.errorsAlarm = new Alarm(this, 'ErrorsAlarm', {
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
    if (errorsAlarmLogicalId) {
      (this.errorsAlarm.node.defaultChild as CfnResource).overrideLogicalId(
        errorsAlarmLogicalId,
      );
    }
    this.errorsAlarm.addAlarmAction(new SnsAction(alertsTopic));

    this.throttlesAlarm = new Alarm(this, 'ThrottlesAlarm', {
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
      this.durationAlarm = new Alarm(this, 'DurationAlarm', {
        alarmName: `${alarmNamePrefix}-lambda-duration`,
        alarmDescription: `${powertoolsServiceName} Lambda p99 duration ≥ 80% of timeout`,
        metric: this.metricDuration({
          period: Duration.minutes(5),
          statistic: 'p99',
        }),
        threshold: thresholdMs,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      this.durationAlarm.addAlarmAction(new SnsAction(alertsTopic));
    }

    // Defer until after stack grant*/addToRolePolicy calls so IAM policy
    // children exist; priority < AwsSolutionsChecks default so suppressions
    // land before nag evaluation.
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
      },
    ];
    Aspects.of(this).add(new ApplyNodeLambdaNagSuppressions(nagSuppressions), {
      priority: 100,
    });
  }
}

/** Applies standard NodeLambda IAM nag suppressions after the construct tree is complete. */
class ApplyNodeLambdaNagSuppressions implements IAspect {
  constructor(private readonly suppressions: NagPackSuppression[]) {}

  visit(node: IConstruct): void {
    if (node instanceof NodeLambda) {
      NagSuppressions.addResourceSuppressions(
        node,
        this.suppressions,
        true,
      );
    }
  }
}
