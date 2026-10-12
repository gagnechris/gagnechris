import type { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import {
  NodejsFunction,
  type NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import type { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { join } from 'node:path';
import type { Construct } from 'constructs';
import { lambdaBase, REPO_ROOT } from './lambda-common.js';
import type { LambdaGuardrailProps } from './lambda-guardrails.js';

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
      logRetention,
      enableDurationAlarm,
      environment,
      bundling,
      timeout,
      ...rest
    } = props;

    const base = lambdaBase(scope, id, {
      powertoolsServiceName,
      alertsTopic,
      alarmNamePrefix,
      iam5NagReason,
      iam5NagAppliesTo,
      logRetention,
      enableDurationAlarm,
      timeout,
      environment: {
        // A few ms of init; worth readable stacks.
        NODE_OPTIONS: '--enable-source-maps',
        ...environment,
      },
    });

    super(scope, id, {
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      tracing: Tracing.ACTIVE,
      logGroup: base.logGroup,
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
      environment: base.environment,
      ...rest,
    });

    const alarms = base.addGuardrails(this);
    this.errorsAlarm = alarms.errorsAlarm;
    this.throttlesAlarm = alarms.throttlesAlarm;
    this.durationAlarm = alarms.durationAlarm;
  }
}
