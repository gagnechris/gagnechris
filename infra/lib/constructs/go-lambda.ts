import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssetHashType, DockerImage } from 'aws-cdk-lib';
import type { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import {
  Architecture,
  Code,
  Function as LambdaFunction,
  Runtime,
  Tracing,
  type FunctionProps,
} from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { POWERTOOLS_METRICS_NAMESPACE } from '../config/constants.js';
import {
  addLambdaGuardrails,
  type LambdaGuardrailProps,
} from './lambda-guardrails.js';
import { REPO_ROOT } from './node-lambda.js';

export const GO_MODULE_ROOT = join(REPO_ROOT, 'go');

const GO_BUILD_ENV = {
  CGO_ENABLED: '0',
  GOOS: 'linux',
  GOARCH: 'arm64',
};

// Reproducible, so the OUTPUT asset hash changes only when the binary does.
const goBuildArgs = (cmd: string, out: string) => [
  'build',
  '-trimpath',
  '-buildvcs=false',
  '-tags',
  'lambda.norpc',
  '-ldflags',
  '-s -w',
  '-o',
  out,
  `./cmd/${cmd}`,
];

export interface GoLambdaProps
  extends
    Omit<
      FunctionProps,
      'runtime' | 'architecture' | 'tracing' | 'logGroup' | 'code' | 'handler'
    >,
    LambdaGuardrailProps {
  /** Directory under `<moduleRoot>/cmd` holding the function's `main` package. */
  readonly cmd: string;
  /** Go module to build from; defaults to the repo's `go/` module. */
  readonly moduleRoot?: string;
  readonly logRetention?: RetentionDays;
}

export class GoLambda extends LambdaFunction {
  readonly errorsAlarm: Alarm;
  readonly throttlesAlarm: Alarm;
  readonly durationAlarm?: Alarm;

  constructor(scope: Construct, id: string, props: GoLambdaProps) {
    const {
      cmd,
      moduleRoot = GO_MODULE_ROOT,
      powertoolsServiceName,
      alertsTopic,
      alarmNamePrefix,
      iam5NagReason,
      iam5NagAppliesTo,
      logRetention = RetentionDays.TWO_WEEKS,
      enableDurationAlarm = false,
      environment,
      timeout,
      ...rest
    } = props;

    const baseId = id.replace(/Function$/, '');
    const logGroup = new LogGroup(scope, `${baseId}LogGroup`, {
      retention: logRetention,
    });

    super(scope, id, {
      runtime: Runtime.PROVIDED_AL2023,
      architecture: Architecture.ARM_64,
      handler: 'bootstrap',
      tracing: Tracing.ACTIVE,
      logGroup,
      timeout,
      code: goCode(moduleRoot, cmd),
      environment: {
        POWERTOOLS_SERVICE_NAME: powertoolsServiceName,
        POWERTOOLS_METRICS_NAMESPACE,
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

function goCode(moduleRoot: string, cmd: string): Code {
  return Code.fromAsset(moduleRoot, {
    assetHashType: AssetHashType.OUTPUT,
    bundling: {
      // Used only when no local Go toolchain is on PATH.
      image: DockerImage.fromRegistry(
        `public.ecr.aws/docker/library/golang:${goVersion(moduleRoot)}`,
      ),
      environment: GO_BUILD_ENV,
      command: ['go', ...goBuildArgs(cmd, '/asset-output/bootstrap')],
      local: {
        tryBundle(outputDir) {
          if (spawnSync('go', ['version']).status !== 0) return false;
          execFileSync('go', goBuildArgs(cmd, join(outputDir, 'bootstrap')), {
            cwd: moduleRoot,
            env: { ...process.env, ...GO_BUILD_ENV },
            stdio: ['ignore', 'pipe', 'inherit'],
          });
          return true;
        },
      },
    },
  });
}

export function goVersion(moduleRoot: string): string {
  const goMod = readFileSync(join(moduleRoot, 'go.mod'), 'utf8');
  const version = /^go (\S+)$/m.exec(goMod)?.[1];
  if (!version) throw new Error(`No go directive in ${moduleRoot}/go.mod`);
  return version;
}
