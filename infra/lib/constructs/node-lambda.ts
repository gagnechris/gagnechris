import { Duration } from 'aws-cdk-lib';
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
import { NagSuppressions } from 'cdk-nag';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Construct } from 'constructs';
import { POWERTOOLS_METRICS_NAMESPACE } from '../config/constants.js';
import {
  addLambdaGuardrails,
  type LambdaGuardrailProps,
} from './lambda-guardrails.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '../../..');

export const DEFAULT_EXTERNAL_MODULES = ['@aws-sdk/*'] as const;

export interface NodeLambdaProps
  extends
    Omit<
      NodejsFunctionProps,
      | 'runtime'
      | 'architecture'
      | 'tracing'
      | 'logGroup'
      | 'depsLockFilePath'
      | 'projectRoot'
    >,
    LambdaGuardrailProps {
  readonly logRetention?: RetentionDays;
}

export interface LambdaFailureDestinationProps {
  readonly alertsTopic: ITopic;
  readonly depthAlarmName: string;
  readonly queueName?: string;
  readonly retentionPeriod?: Duration;
}

/** Alarms on messages sent, not depth, so each new failure re-notifies. */
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
        // 5-10 ms of API init (scripts/measure-api-init.ts); worth readable stacks.
        NODE_OPTIONS: '--enable-source-maps',
        ...environment,
      },
      ...rest,
    });

    const alarms = addLambdaGuardrails(scope, id, this, {
      powertoolsServiceName,
      alertsTopic,
      alarmNamePrefix,
      iam5NagReason,
      iam5NagAppliesTo,
      enableDurationAlarm,
      timeout,
    });
    this.errorsAlarm = alarms.errorsAlarm;
    this.throttlesAlarm = alarms.throttlesAlarm;
    this.durationAlarm = alarms.durationAlarm;
  }
}
