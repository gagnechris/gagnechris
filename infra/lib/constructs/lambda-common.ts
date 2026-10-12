import { Duration } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
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
  type LambdaAlarms,
  type LambdaGuardrailProps,
} from './lambda-guardrails.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '../../..');

export interface LambdaBaseProps extends LambdaGuardrailProps {
  readonly logRetention?: RetentionDays;
  readonly environment?: Record<string, string>;
  readonly timeout?: Duration;
}

export interface LambdaBase {
  readonly logGroup: LogGroup;
  readonly environment: Record<string, string>;
  readonly addGuardrails: (fn: LambdaFunction) => LambdaAlarms;
}

/** The log group, Powertools env and guardrails every Lambda gets; call before `super`, then `addGuardrails(this)`. */
export function lambdaBase(
  scope: Construct,
  id: string,
  props: LambdaBaseProps,
): LambdaBase {
  const {
    logRetention = RetentionDays.TWO_WEEKS,
    environment,
    enableDurationAlarm = false,
    ...guardrails
  } = props;
  const logGroup = new LogGroup(
    scope,
    `${id.replace(/Function$/, '')}LogGroup`,
    { retention: logRetention },
  );
  return {
    logGroup,
    environment: {
      POWERTOOLS_SERVICE_NAME: props.powertoolsServiceName,
      POWERTOOLS_METRICS_NAMESPACE,
      ...environment,
    },
    addGuardrails: (fn) =>
      addLambdaGuardrails(scope, id, fn, {
        ...guardrails,
        enableDurationAlarm,
      }),
  };
}

export interface LambdaFailureDestinationProps {
  readonly alertsTopic: ITopic;
  readonly alarmName: string;
  readonly queueName?: string;
  readonly retentionPeriod?: Duration;
}

/** Alarms on messages sent, not depth, so each new failure re-notifies. */
export class LambdaFailureDestination extends Construct {
  readonly queue: Queue;
  readonly streamDestination: SqsDlq;
  readonly messagesSentAlarm: Alarm;

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

    // The deployed id and name say depth; changing either replaces the alarm.
    this.messagesSentAlarm = new Alarm(this, 'DepthAlarm', {
      alarmName: props.alarmName,
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
    this.messagesSentAlarm.addAlarmAction(new SnsAction(props.alertsTopic));

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
