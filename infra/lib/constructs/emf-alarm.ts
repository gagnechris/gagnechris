import { Duration } from 'aws-cdk-lib';
import {
  Alarm,
  CfnAlarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
  type IMetric,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import { POWERTOOLS_METRICS_NAMESPACE } from '../config/constants.js';

/** Powertools emits a `service` dimension from POWERTOOLS_SERVICE_NAME. */
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

export function metricAlarm(
  scope: Construct,
  id: string,
  props: {
    readonly alarmName: string;
    readonly alarmDescription: string;
    readonly metric: IMetric;
    readonly alertsTopic: ITopic;
    /** Defaults to 1 (any occurrence). */
    readonly threshold?: number;
    /** Defaults to 1 period. */
    readonly evaluationPeriods?: number;
  },
): Alarm {
  const alarm = new Alarm(scope, id, {
    alarmName: props.alarmName,
    alarmDescription: props.alarmDescription,
    metric: props.metric,
    threshold: props.threshold ?? 1,
    evaluationPeriods: props.evaluationPeriods ?? 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });
  alarm.addAlarmAction(new SnsAction(props.alertsTopic));
  return alarm;
}

/**
 * Alarms when a metric that should arrive at least once per `period` stops:
 * missing data breaches. The warm-up keeps a new alarm quiet until its first
 * datapoint (CloudWatch allows at most 2 days).
 */
export function heartbeatAlarm(
  scope: Construct,
  id: string,
  props: {
    readonly alarmName: string;
    readonly alarmDescription: string;
    readonly metric: IMetric;
    readonly alertsTopic: ITopic;
    readonly evaluationPeriods: number;
    readonly warmUpMinutes: number;
  },
): Alarm {
  const alarm = new Alarm(scope, id, {
    alarmName: props.alarmName,
    alarmDescription: props.alarmDescription,
    metric: props.metric,
    threshold: 1,
    evaluationPeriods: props.evaluationPeriods,
    datapointsToAlarm: props.evaluationPeriods,
    comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
    treatMissingData: TreatMissingData.BREACHING,
  });
  (alarm.node.defaultChild as CfnAlarm).warmUpConfiguration = {
    warmUpPeriodDurationInMinutes: props.warmUpMinutes,
  };
  alarm.addAlarmAction(new SnsAction(props.alertsTopic));
  return alarm;
}
