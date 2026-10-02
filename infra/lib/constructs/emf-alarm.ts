import { Duration } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
  type IMetric,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import { POWERTOOLS_METRICS_NAMESPACE } from '../config/constants.js';

/**
 * CloudWatch alarm on a Powertools EMF custom metric (CHR-168).
 * Dimensions match the Lambda `POWERTOOLS_SERVICE_NAME` default `service` dim.
 */
export function emfServiceAlarm(
  scope: Construct,
  id: string,
  props: {
    readonly alarmName: string;
    readonly alarmDescription: string;
    readonly serviceName: string;
    readonly metricName: string;
    readonly alertsTopic: ITopic;
  },
): Alarm {
  return metricAlarm(scope, id, {
    alarmName: props.alarmName,
    alarmDescription: props.alarmDescription,
    metric: new Metric({
      namespace: POWERTOOLS_METRICS_NAMESPACE,
      metricName: props.metricName,
      dimensionsMap: { service: props.serviceName },
      statistic: 'Sum',
      period: Duration.minutes(5),
    }),
    alertsTopic: props.alertsTopic,
  });
}

/** Sum ≥ 1 in 5 minutes → SNS, missing data not breaching. */
export function metricAlarm(
  scope: Construct,
  id: string,
  props: {
    readonly alarmName: string;
    readonly alarmDescription: string;
    readonly metric: IMetric;
    readonly alertsTopic: ITopic;
  },
): Alarm {
  const alarm = new Alarm(scope, id, {
    alarmName: props.alarmName,
    alarmDescription: props.alarmDescription,
    metric: props.metric,
    threshold: 1,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });
  alarm.addAlarmAction(new SnsAction(props.alertsTopic));
  return alarm;
}
