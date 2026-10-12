import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssetHashType, DockerImage, type ILocalBundling } from 'aws-cdk-lib';
import type { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import {
  Architecture,
  Code,
  Function as LambdaFunction,
  Runtime,
  Tracing,
  type FunctionProps,
} from 'aws-cdk-lib/aws-lambda';
import type { RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { lambdaBase, REPO_ROOT } from './lambda-common.js';
import type { LambdaGuardrailProps } from './lambda-guardrails.js';

export const GO_MODULE_ROOT = join(REPO_ROOT, 'services/api');

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
  /** Go module to build from; defaults to `services/api`. */
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
      logRetention,
      enableDurationAlarm,
      environment,
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
      environment,
    });

    super(scope, id, {
      runtime: Runtime.PROVIDED_AL2023,
      architecture: Architecture.ARM_64,
      handler: 'bootstrap',
      tracing: Tracing.ACTIVE,
      logGroup: base.logGroup,
      timeout,
      code: goCode(moduleRoot, cmd),
      environment: base.environment,
      ...rest,
    });

    const alarms = base.addGuardrails(this);
    this.errorsAlarm = alarms.errorsAlarm;
    this.throttlesAlarm = alarms.throttlesAlarm;
    this.durationAlarm = alarms.durationAlarm;
  }
}

function goCode(moduleRoot: string, cmd: string): Code {
  return Code.fromAsset(moduleRoot, {
    assetHashType: AssetHashType.OUTPUT,
    bundling: {
      // Used when no local Go can build with the go.mod version.
      image: DockerImage.fromRegistry(
        `public.ecr.aws/docker/library/golang:${goVersion(moduleRoot)}`,
      ),
      environment: GO_BUILD_ENV,
      command: ['go', ...goBuildArgs(cmd, '/asset-output/bootstrap')],
      local: localGoBundling(moduleRoot, cmd),
    },
  });
}

/**
 * Builds with the local `go` only when it runs exactly the go.mod version, so a
 * laptop's newer patch release can't produce a different binary (and asset
 * hash) than CI and the Docker image.
 */
export function localGoBundling(
  moduleRoot: string,
  cmd: string,
): ILocalBundling {
  return {
    tryBundle(outputDir) {
      const env = {
        ...process.env,
        ...GO_BUILD_ENV,
        GOTOOLCHAIN: `go${goVersion(moduleRoot)}`,
      };
      const version = spawnSync('go', ['env', 'GOVERSION'], {
        cwd: moduleRoot,
        env,
        encoding: 'utf8',
      });
      if (
        version.status !== 0 ||
        version.stdout.trim() !== `go${goVersion(moduleRoot)}`
      ) {
        return false;
      }
      execFileSync('go', goBuildArgs(cmd, join(outputDir, 'bootstrap')), {
        cwd: moduleRoot,
        env,
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      return true;
    },
  };
}

export function goVersion(moduleRoot: string): string {
  const goMod = readFileSync(join(moduleRoot, 'go.mod'), 'utf8');
  const version = /^go (\S+)$/m.exec(goMod)?.[1];
  if (!version) throw new Error(`No go directive in ${moduleRoot}/go.mod`);
  return version;
}
