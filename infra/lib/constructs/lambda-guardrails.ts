import { Aspects, Duration, type IAspect } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import {
  NagSuppressions,
  type NagPackSuppression,
  type NagPackSuppressionAppliesTo,
} from 'cdk-nag';
import type { Construct, IConstruct } from 'constructs';

export interface LambdaGuardrailProps {
  readonly powertoolsServiceName: string;
  readonly alertsTopic: ITopic;
  readonly alarmNamePrefix: string;
  readonly iam5NagReason: string;
  readonly iam5NagAppliesTo: NagPackSuppressionAppliesTo[];
  readonly enableDurationAlarm?: boolean;
}

export interface LambdaAlarms {
  readonly errorsAlarm: Alarm;
  readonly throttlesAlarm: Alarm;
  readonly durationAlarm?: Alarm;
}

/** Errors, throttles and optional p99 duration alarms, plus the cdk-nag suppressions every function needs. */
export function addLambdaGuardrails(
  scope: Construct,
  id: string,
  fn: LambdaFunction,
  props: LambdaGuardrailProps & { readonly timeout?: Duration },
): LambdaAlarms {
  const { powertoolsServiceName, alertsTopic, alarmNamePrefix, timeout } =
    props;
  const baseId = id.replace(/Function$/, '');

  const errorsAlarm = new Alarm(scope, `${baseId}LambdaErrors`, {
    alarmName: `${alarmNamePrefix}-lambda-errors`,
    alarmDescription: `${powertoolsServiceName} Lambda errors > 0 in 5 minutes`,
    metric: fn.metricErrors({
      period: Duration.minutes(5),
      statistic: 'Sum',
    }),
    threshold: 1,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });
  errorsAlarm.addAlarmAction(new SnsAction(alertsTopic));

  const throttlesAlarm = new Alarm(scope, `${id}ThrottlesAlarm`, {
    alarmName: `${alarmNamePrefix}-lambda-throttles`,
    alarmDescription: `${powertoolsServiceName} Lambda throttles > 0 in 5 minutes`,
    metric: fn.metricThrottles({
      period: Duration.minutes(5),
      statistic: 'Sum',
    }),
    threshold: 1,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });
  throttlesAlarm.addAlarmAction(new SnsAction(alertsTopic));

  let durationAlarm: Alarm | undefined;
  if (props.enableDurationAlarm && timeout) {
    const thresholdMs = Math.floor(timeout.toMilliseconds() * 0.8);
    durationAlarm = new Alarm(scope, `${id}DurationAlarm`, {
      alarmName: `${alarmNamePrefix}-lambda-duration`,
      alarmDescription: `${powertoolsServiceName} Lambda p99 duration ≥ 80% of timeout`,
      metric: fn.metricDuration({
        period: Duration.minutes(5),
        statistic: 'p99',
      }),
      threshold: thresholdMs,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    durationAlarm.addAlarmAction(new SnsAction(alertsTopic));
  }

  const nagSuppressions: NagPackSuppression[] = [
    {
      id: 'AwsSolutions-IAM4',
      reason:
        'Lambda functions use AWSLambdaBasicExecutionRole for CloudWatch Logs.',
      appliesTo: [
        'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      ],
    },
    {
      id: 'AwsSolutions-IAM5',
      reason: props.iam5NagReason,
      appliesTo: props.iam5NagAppliesTo,
    },
  ];
  // As an aspect so policies granted after construction are covered too.
  Aspects.of(fn).add(new ApplyNagSuppressions(fn, nagSuppressions), {
    priority: 100,
  });

  return { errorsAlarm, throttlesAlarm, durationAlarm };
}

class ApplyNagSuppressions implements IAspect {
  constructor(
    private readonly target: IConstruct,
    private readonly suppressions: NagPackSuppression[],
  ) {}

  visit(node: IConstruct): void {
    if (node === this.target) {
      NagSuppressions.addResourceSuppressions(node, this.suppressions, true);
    }
  }
}
