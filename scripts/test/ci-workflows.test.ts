import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');
const ACTIONS_DIR = join(ROOT, '.github', 'actions');
const SETUP_ACTION = './.github/actions/setup';

interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  shell?: string;
  with?: Record<string, unknown>;
}

interface RunDefaults {
  defaults?: { run?: { shell?: string } };
}

interface Job extends RunDefaults {
  name?: string;
  if?: string;
  permissions?: Record<string, string> | string;
  steps?: Step[];
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  outputs?: Record<string, string>;
}

interface Workflow extends RunDefaults {
  on?: Record<string, unknown>;
  permissions?: Record<string, string> | string;
  jobs: Record<string, Job>;
}

function loadYaml<T>(path: string): T {
  return parse(readFileSync(path, 'utf8')) as T;
}

const workflowFiles = readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => join(WORKFLOWS_DIR, f));

const actionFiles = readdirSync(ACTIONS_DIR).map((d) =>
  join(ACTIONS_DIR, d, 'action.yml'),
);

const workflows = workflowFiles.map((path) => ({
  path,
  doc: loadYaml<Workflow>(path),
}));

const cdk = loadYaml<Workflow>(join(WORKFLOWS_DIR, 'cdk.yml'));

function hasIdToken(job: Job, workflow: Workflow): boolean {
  const perms = job.permissions ?? workflow.permissions;
  if (perms === 'write-all') return true;
  return typeof perms === 'object' && perms['id-token'] === 'write';
}

const readsSecret = (job: Job) => /\bsecrets\./.test(JSON.stringify(job));

function stepIndex(job: Job, predicate: (step: Step) => boolean): number {
  return (job.steps ?? []).findIndex(predicate);
}

const NOTIFY_ALERTS = 'bash scripts/ci/notify-alerts.sh';

const isCredentialStep = (s: Step) =>
  s.uses?.startsWith('aws-actions/configure-aws-credentials@') ?? false;

function expectNoNpm(job: Job): void {
  for (const step of job.steps ?? []) {
    if (step.uses) {
      expect(step.uses).toMatch(
        /^(actions\/checkout|aws-actions\/configure-aws-credentials)@[0-9a-f]{40}$/,
      );
    }
    expect(step.run ?? '').not.toMatch(/\b(npm|npx|node_modules)\b/);
  }
}

describe('GitHub Actions supply chain', () => {
  it('gives every workflow a read-only token unless a job asks for more', () => {
    const offenders = workflows
      .filter(({ doc }) => {
        const perms = doc.permissions;
        return typeof perms !== 'object' || perms.contents !== 'read';
      })
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('pins every remote action to a full commit SHA', () => {
    const offenders: string[] = [];
    const pinned = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
    for (const file of [...workflowFiles, ...actionFiles]) {
      for (const match of readFileSync(file, 'utf8').matchAll(
        /^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm,
      )) {
        const ref = match[1]!;
        if (ref.startsWith('./')) continue;
        if (!pinned.test(ref)) offenders.push(`${file}: ${ref}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never runs install scripts in a job that can mint an OIDC token or reads a secret', () => {
    const offenders: string[] = [];
    for (const { path, doc } of workflows) {
      for (const [jobId, job] of Object.entries(doc.jobs)) {
        if (!hasIdToken(job, doc) && !readsSecret(job)) continue;
        for (const step of job.steps ?? []) {
          const label = `${path}#${jobId}/${step.name ?? step.uses}`;
          if (
            step.uses === SETUP_ACTION &&
            step.with?.['ignore-scripts'] !== 'true'
          ) {
            offenders.push(`${label}: setup without ignore-scripts`);
          }
          for (const line of (step.run ?? '').split('\n')) {
            if (
              /\bnpm\s+(ci|install|i)\b/.test(line) &&
              !line.includes('--ignore-scripts')
            ) {
              offenders.push(`${label}: ${line.trim()}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Steps of one job share the runner, so a build's install scripts could
  // reach any later secret step through files or $GITHUB_ENV.
  it('runs native build installs only after every step that holds a secret', () => {
    const buildsWithInstallScripts = (run: string) =>
      /\beas\s+build\b|\bnpx\b|\bpod\s+install\b|eas-local-build\.sh\s+build\b/.test(
        run,
      );
    const offenders: string[] = [];
    for (const { path, doc } of workflows) {
      for (const [jobId, job] of Object.entries(doc.jobs)) {
        if (!readsSecret(job)) continue;
        const steps = job.steps ?? [];
        const lastSecret = steps
          .map((s) => /\bsecrets\./.test(JSON.stringify(s)))
          .lastIndexOf(true);
        steps.forEach((step, i) => {
          if (buildsWithInstallScripts(step.run ?? '') && i <= lastSecret) {
            offenders.push(`${path}#${jobId}/${step.name ?? step.uses}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('installs before any credential step in every cdk.yml job', () => {
    for (const [jobId, job] of Object.entries(cdk.jobs)) {
      const setup = stepIndex(job, (s) => s.uses === SETUP_ACTION);
      const creds = stepIndex(job, isCredentialStep);
      if (setup === -1 || creds === -1) continue;
      expect(setup, jobId).toBeLessThan(creds);
    }
  });

  it('plan job runs only official actions, git, bash and the AWS CLI', () => {
    const plan = cdk.jobs.plan!;
    expect(plan.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expectNoNpm(plan);
  });
});

// GitHub runs an implicit shell as `bash -e`; only an explicit `shell: bash`
// adds pipefail, so `a | tee` otherwise takes tee's status.
function pipesWithoutPipefail(run: string, shell: string | undefined): boolean {
  if (shell === 'bash') return false;
  if (/\bset\s+(?:-\w+\s+)*-\w*o\s*pipefail\b/.test(run)) return false;
  const unquoted = run
    .replace(/\$\{\{[\s\S]*?\}\}/g, '')
    .replace(/'[^'\n]*'/g, '')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '')
    .replace(/\|\|/g, '');
  return /\|/.test(unquoted);
}

describe('workflow shells', () => {
  it('runs every step that pipes with pipefail', () => {
    const offenders: string[] = [];
    for (const { path, doc } of workflows) {
      for (const [jobId, job] of Object.entries(doc.jobs)) {
        for (const step of job.steps ?? []) {
          if (step.run === undefined) continue;
          const shell =
            step.shell ?? job.defaults?.run?.shell ?? doc.defaults?.run?.shell;
          if (pipesWithoutPipefail(step.run, shell)) {
            offenders.push(`${path}#${jobId}/${step.name ?? step.run}`);
          }
        }
      }
    }
    for (const file of actionFiles) {
      const action = loadYaml<{ runs: { steps?: Step[] } }>(file);
      for (const step of action.runs.steps ?? []) {
        if (
          step.run !== undefined &&
          pipesWithoutPipefail(step.run, step.shell)
        ) {
          offenders.push(`${file}/${step.name ?? step.run}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('flags a pipe only when pipefail is missing', () => {
    expect(pipesWithoutPipefail('a | tee -a out', undefined)).toBe(true);
    expect(pipesWithoutPipefail('a | tee -a out', 'sh')).toBe(true);
    expect(pipesWithoutPipefail('a | tee -a out', 'bash')).toBe(false);
    expect(
      pipesWithoutPipefail('set -euo pipefail\na | tee out', undefined),
    ).toBe(false);
    expect(pipesWithoutPipefail('set -o pipefail\na | b', undefined)).toBe(
      false,
    );
    expect(pipesWithoutPipefail("grep -E '(a|b)' f || true", undefined)).toBe(
      false,
    );
    expect(pipesWithoutPipefail('echo "${{ a || b }}" >> out', undefined)).toBe(
      false,
    );
  });
});

describe('path-filtered jobs', () => {
  const ci = loadYaml<Workflow>(join(WORKFLOWS_DIR, 'ci.yml'));
  const mobile = loadYaml<Workflow>(join(WORKFLOWS_DIR, 'mobile.yml'));

  function filters(job: Job): Record<string, string[]> {
    const step = job.steps?.find((s) =>
      s.uses?.startsWith('dorny/paths-filter@'),
    );
    return parse(String(step?.with?.filters ?? '')) as Record<string, string[]>;
  }

  it('reruns Mobile and API integration when the Node or npm config changes', () => {
    for (const file of ['.nvmrc', '.npmrc']) {
      expect(filters(mobile.jobs.mobile!).mobile).toContain(file);
      expect(filters(ci.jobs['api-integration']!).api).toContain(file);
    }
  });

  // Workspace imports are followed through each package's `exports`, so
  // their package.json files count as loaded too. The harness also reads
  // CloudFront function sources from disk at runtime.
  async function localStaticServerFiles(): Promise<string[]> {
    const { metafile } = await build({
      entryPoints: ['scripts/local/static-server.ts'],
      absWorkingDir: ROOT,
      bundle: true,
      write: false,
      metafile: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
      plugins: [
        {
          name: 'external-third-party',
          setup(b) {
            b.onResolve({ filter: /^[^./]/ }, ({ path }) =>
              path.startsWith('@gagnechris/') ? undefined : { external: true },
            );
          },
        },
      ],
    });
    const files = new Set(Object.keys(metafile.inputs));
    for (const input of [...files]) {
      let dir = dirname(input);
      while (dir !== '.' && !existsSync(join(ROOT, dir, 'package.json'))) {
        dir = dirname(dir);
      }
      files.add(dir === '.' ? 'package.json' : `${dir}/package.json`);
    }
    const harness = 'infra/lib/cloudfront/harness.ts';
    expect(files.has(harness)).toBe(true);
    const harnessSource = readFileSync(join(ROOT, harness), 'utf8');
    for (const [, name] of harnessSource.matchAll(
      /functionSource\(\s*'([^']+)'/g,
    )) {
      files.add(`${dirname(harness)}/${name}`);
    }
    return [...files].sort();
  }

  it('runs Local E2E smoke when a file the local static server loads changes', async () => {
    const patterns = filters(ci.jobs['local-e2e']!).e2e ?? [];
    const files = await localStaticServerFiles();
    for (const file of files) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
    }
    expect(files).toContain('infra/lib/cloudfront/app-viewer-request.js');
    const unmatched = files.filter(
      (file) => !patterns.some((pattern) => matchesGlob(file, pattern)),
    );
    expect(unmatched).toEqual([]);
  });

  it('runs every filtered step on a push to main', () => {
    const offenders: string[] = [];
    for (const { path, doc } of workflows) {
      for (const [jobId, job] of Object.entries(doc.jobs)) {
        for (const step of job.steps ?? []) {
          if (!/steps\.filter\.outputs\./.test(step.if ?? '')) continue;
          if (!step.if!.includes("github.event_name == 'push' ||")) {
            offenders.push(`${path}#${jobId}/${step.name ?? step.uses}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('VITE_AUTH_MODE=local guard step', () => {
  const step = loadYaml<Workflow>(
    join(WORKFLOWS_DIR, 'ci.yml'),
  ).jobs.build!.steps!.find(
    (s) => s.name === 'Reject VITE_AUTH_MODE=local in production build',
  )!;
  const guardMessage = /'(VITE_AUTH_MODE=local is not allowed[^']*)'/.exec(
    readFileSync(join(ROOT, 'apps', 'web', 'vite.config.ts'), 'utf8'),
  )![1]!;

  // Runs the step with `npm` stubbed to print `output` and exit `code`.
  function runStep(output: string, code: number) {
    const bin = join(tempDir(), 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'npm'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$FAKE_NPM_OUTPUT" >&2\nexit ${code}\n`,
    );
    chmodSync(join(bin, 'npm'), 0o755);
    return spawnSync('bash', ['-eo', 'pipefail', '-c', step.run!], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_NPM_OUTPUT: output,
      },
      encoding: 'utf8',
    }).status;
  }

  it('passes only when the build fails on the guard', () => {
    expect(runStep(`Error: ${guardMessage}`, 1)).toBe(0);
    expect(runStep('error TS2304: Cannot find name', 1)).not.toBe(0);
    expect(runStep('built in 1s', 0)).not.toBe(0);
  });
});

type WorkflowRunWorkflow = Workflow & {
  on: Record<string, unknown> & {
    workflow_run: { workflows: string[]; types: string[] };
  };
};
type GatedJob = Job & { if?: string; needs?: string; environment?: string };

describe('non-strict branch protection', () => {
  const ruleset = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'main-branch-ruleset.json'), 'utf8'),
  ) as {
    rules: {
      type: string;
      parameters?: { strict_required_status_checks_policy?: boolean };
    }[];
  };
  const alert = loadYaml<WorkflowRunWorkflow>(
    join(WORKFLOWS_DIR, 'main-ci-alert.yml'),
  );

  it('alerts on a red main or a failed deploy because PRs needn’t be up to date', () => {
    const checks = ruleset.rules.find(
      (r) => r.type === 'required_status_checks',
    );
    expect(checks?.parameters?.strict_required_status_checks_policy).toBe(
      false,
    );
    expect(alert.on.workflow_run.workflows.sort()).toEqual([
      'CDK',
      'CI',
      'Mobile',
    ]);
    expect(alert.on.workflow_run.types).toEqual(['completed']);

    const decide = alert.jobs.decide! as GatedJob;
    expect(hasIdToken(decide, alert)).toBe(false);
    expect(decide.environment).toBeUndefined();
    expect(
      decide.steps?.some((s) =>
        s.run?.includes('scripts/ci/main-alert-decision.sh'),
      ),
    ).toBe(true);

    const job = alert.jobs.alert! as GatedJob;
    expect(job.needs).toBe('decide');
    expect(job.if).toBe("needs.decide.outputs.alert == 'true'");
    expect(job.environment).toBe('prod');
    const steps = job.steps ?? [];
    expect(steps.some((s) => s.run?.includes(NOTIFY_ALERTS))).toBe(true);
    expectNoNpm(job);
  });
});

describe('main-alert-decision.sh', () => {
  const decide = (...args: string[]) =>
    runScript('main-alert-decision.sh', args, {});

  it.each([
    ['CI', 'push', 'main', 'failure', 'red-main'],
    ['Mobile', 'push', 'main', 'timed_out', 'red-main'],
    ['CI', 'push', 'main', 'startup_failure', 'red-main'],
    // e.g. a stack update that rolls back fails the deploy job.
    ['CDK', 'workflow_run', 'main', 'failure', 'deploy-failed'],
    ['CDK', 'workflow_run', 'main', 'timed_out', 'deploy-failed'],
  ])(
    'alerts: %s %s on %s ended %s',
    (workflow, event, branch, conclusion, kind) => {
      expect(decide(workflow, event, branch, conclusion)).toMatchObject({
        status: 0,
        stdout: `alert=true\nkind=${kind}`,
      });
    },
  );

  it.each([
    // A late or replaced run is cancelled; the lag check covers a stall.
    ['CI', 'push', 'main', 'cancelled'],
    ['CDK', 'workflow_run', 'main', 'cancelled'],
    // CDK after a PR's CI, or after a red CI, skips every job.
    ['CDK', 'workflow_run', 'main', 'skipped'],
    ['CDK', 'workflow_run', 'main', 'success'],
    ['CI', 'push', 'main', 'success'],
    ['CI', 'pull_request', 'feature', 'failure'],
    ['CDK', 'pull_request', 'feature', 'failure'],
    ['CI', 'push', 'feature', 'failure'],
    // Drift alerts by itself; a dispatched deploy is watched.
    ['CDK', 'schedule', 'main', 'failure'],
    ['CDK', 'workflow_dispatch', 'main', 'failure'],
  ])(
    'stays quiet: %s %s on %s ended %s',
    (workflow, event, branch, conclusion) => {
      expect(decide(workflow, event, branch, conclusion)).toMatchObject({
        status: 0,
        stdout: 'alert=false\nkind=none',
      });
    },
  );
});

describe('deploy lag alert workflow', () => {
  const lag = loadYaml<Workflow & { on: { schedule: { cron: string }[] } }>(
    join(WORKFLOWS_DIR, 'deploy-lag-alert.yml'),
  );
  const job = lag.jobs.check! as GatedJob;

  it('runs hourly in prod with the drift role and no npm', () => {
    expect(lag.on.schedule.map((s) => s.cron)).toEqual(['23 * * * *']);
    expect(job.environment).toBe('prod');
    expect(job.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expectNoNpm(job);
    const steps = job.steps ?? [];
    expect(steps.find(isCredentialStep)?.with?.['role-to-assume']).toBe(
      '${{ vars.AWS_DRIFT_ROLE_ARN }}',
    );
    const check = stepIndex(
      job,
      (s) => s.run?.includes('scripts/ci/deploy-lag.sh') ?? false,
    );
    const notify = stepIndex(
      job,
      (s) => s.run?.includes(NOTIFY_ALERTS) ?? false,
    );
    expect(check).toBeGreaterThan(stepIndex(job, isCredentialStep));
    expect(notify).toBeGreaterThan(check);
    expect(steps[notify]!.if).toContain("steps.lag.outputs.alert == 'true'");
    expect(steps[notify]!.if).toContain('failure()');
  });
});

describe('deploy job guards', () => {
  const deploy = cdk.jobs.deploy!;

  it('runs check:deployed-gsi after credentials and before cdk deploy', () => {
    const creds = stepIndex(deploy, isCredentialStep);
    const gsi = stepIndex(
      deploy,
      (s) => s.run?.includes('npm run check:deployed-gsi') ?? false,
    );
    const cdkDeploy = stepIndex(
      deploy,
      (s) => s.run?.includes('cdk -- deploy') ?? false,
    );
    expect(creds).toBeGreaterThan(-1);
    expect(gsi).toBeGreaterThan(creds);
    expect(cdkDeploy).toBeGreaterThan(gsi);
    expect(deploy.steps![gsi]!.if).toBe(deploy.steps![cdkDeploy]!.if);
  });

  it('runs CDK deploy before the web deploy in the same job', () => {
    const cdkDeploy = stepIndex(
      deploy,
      (s) => s.run?.includes('cdk -- deploy') ?? false,
    );
    const web = stepIndex(
      deploy,
      (s) => s.run?.includes('scripts/deploy-web.sh') ?? false,
    );
    expect(cdkDeploy).toBeGreaterThan(-1);
    expect(web).toBeGreaterThan(cdkDeploy);
  });

  it('runs the web deploy only when plan says web, and records every deploy', () => {
    expect(deploy.if).toBe(
      "needs.plan.outputs.cdk == 'true' || needs.plan.outputs.web == 'true' || needs.plan.outputs.components == 'true'",
    );
    const web = stepIndex(
      deploy,
      (s) => s.run?.includes('scripts/deploy-web.sh') ?? false,
    );
    expect(deploy.steps![web]!.if).toBe("needs.plan.outputs.web == 'true'");
    expect(
      (deploy.steps ?? []).filter(
        (s) =>
          s.run?.includes('deploy-web.sh') ||
          s.run?.includes('republishAll') ||
          s.run?.includes('create-invalidation') ||
          s.run?.includes('s3 sync'),
      ),
    ).toHaveLength(1);
    // A CDK-only deploy must still advance deployed-sha, or deploy-lag alerts.
    const record = stepIndex(
      deploy,
      (s) => s.run?.includes('deployedSha') ?? false,
    );
    expect(record).toBeGreaterThan(web);
    expect(deploy.steps![record]!.if).toBe('success()');
  });

  it('publishes the component catalog after CDK deploy, only when plan says components', () => {
    const cdkDeploy = stepIndex(
      deploy,
      (s) => s.run?.includes('cdk -- deploy') ?? false,
    );
    const components = stepIndex(
      deploy,
      (s) => s.run?.includes('scripts/deploy-components.sh') ?? false,
    );
    const record = stepIndex(
      deploy,
      (s) => s.run?.includes('deployedSha') ?? false,
    );
    expect(components).toBeGreaterThan(cdkDeploy);
    expect(record).toBeGreaterThan(components);
    expect(deploy.steps![components]!.if).toBe(
      "needs.plan.outputs.components == 'true'",
    );
    expect(cdk.jobs.plan!.outputs?.components).toBe(
      '${{ steps.filter.outputs.components }}',
    );
  });

  it('checks the built web shells in the Lint, test, and build job', () => {
    const ci = loadYaml<Workflow>(join(WORKFLOWS_DIR, 'ci.yml'));
    const build = ci.jobs.build!;
    const buildStep = stepIndex(build, (s) => s.run === 'npm run build');
    const shells = stepIndex(
      build,
      (s) => s.run === 'npm run check:web-shells',
    );
    expect(buildStep).toBeGreaterThan(-1);
    expect(shells).toBeGreaterThan(buildStep);
  });

  it('serializes plan and deploy in cdk-prod without cancelling', () => {
    for (const jobId of ['plan', 'deploy']) {
      expect(cdk.jobs[jobId]!.concurrency).toEqual({
        group: 'cdk-prod',
        'cancel-in-progress': false,
      });
    }
  });

  it('keeps required status check names and the CDK diff (PR) job', () => {
    const ruleset = JSON.parse(
      readFileSync(join(ROOT, 'scripts', 'main-branch-ruleset.json'), 'utf8'),
    ) as {
      rules: Array<{
        type: string;
        parameters?: { required_status_checks?: Array<{ context: string }> };
      }>;
    };
    const required = ruleset.rules
      .flatMap((r) => r.parameters?.required_status_checks ?? [])
      .map((c) => c.context);
    const jobNames = workflows.flatMap(({ doc }) =>
      Object.values(doc.jobs).map((j) => j.name),
    );
    for (const context of required) {
      expect(jobNames).toContain(context);
    }
    expect(cdk.jobs.diff?.name).toBe('CDK diff (PR)');
  });

  // A required check that is skipped never reports, so the PR waits forever;
  // path filtering must happen inside the job.
  it('always runs required checks on pull requests', () => {
    const ruleset = JSON.parse(
      readFileSync(join(ROOT, 'scripts', 'main-branch-ruleset.json'), 'utf8'),
    ) as {
      rules: Array<{
        parameters?: { required_status_checks?: Array<{ context: string }> };
      }>;
    };
    const required = ruleset.rules
      .flatMap((r) => r.parameters?.required_status_checks ?? [])
      .map((c) => c.context);
    expect(required.length).toBeGreaterThan(0);
    for (const context of required) {
      const owners = workflows.flatMap(({ path, doc }) =>
        Object.values(doc.jobs)
          .filter((j) => j.name === context)
          .map((job) => ({ path, doc, job })),
      );
      expect(owners, context).toHaveLength(1);
      const { path, doc, job } = owners[0]!;
      // `always()` is the one job-level `if` that can't skip the check.
      if (job.if !== undefined) {
        expect(job.if, `${context} has a job-level if`).toBe('always()');
      }
      expect(doc.on, path).toHaveProperty('pull_request');
      for (const [event, config] of Object.entries(doc.on ?? {})) {
        const keys = Object.keys((config as object | null) ?? {});
        expect(
          keys.filter((k) => k === 'paths' || k === 'paths-ignore'),
          `${path} on.${event}`,
        ).toEqual([]);
      }
    }
  });
});

const tmpRoots: string[] = [];
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-workflows-'));
  tmpRoots.push(dir);
  return dir;
}

function stubAwsPath(): string {
  const bin = join(tempDir(), 'bin');
  mkdirSync(bin);
  const aws = join(bin, 'aws');
  writeFileSync(
    aws,
    '#!/usr/bin/env bash\nprintf "%s" "${FAKE_AWS_STDOUT:-}"\nprintf "%s" "${FAKE_AWS_STDERR:-}" >&2\nexit "${FAKE_AWS_EXIT:-0}"\n',
  );
  chmodSync(aws, 0o755);
  return `${bin}:${process.env.PATH}`;
}

function runScript(
  script: string,
  args: string[],
  env: Record<string, string>,
  cwd = ROOT,
) {
  const result = spawnSync(
    'bash',
    [join(ROOT, 'scripts', 'ci', script), ...args],
    {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    },
  );
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr,
  };
}

describe('read-deployed-sha.sh', () => {
  const PATH = stubAwsPath();
  const sha = 'a'.repeat(40);

  it('prints the deployed SHA', () => {
    const r = runScript('read-deployed-sha.sh', [], {
      PATH,
      FAKE_AWS_STDOUT: `${sha}\n`,
    });
    expect(r).toMatchObject({ status: 0, stdout: sha });
  });

  it('prints nothing on ParameterNotFound (first deploy)', () => {
    const r = runScript('read-deployed-sha.sh', [], {
      PATH,
      FAKE_AWS_EXIT: '254',
      FAKE_AWS_STDERR:
        'An error occurred (ParameterNotFound) when calling the GetParameter operation:',
    });
    expect(r).toMatchObject({ status: 0, stdout: '' });
  });

  it.each([
    'An error occurred (AccessDeniedException) when calling the GetParameter operation',
    'An error occurred (ThrottlingException) when calling the GetParameter operation',
    'Could not connect to the endpoint URL',
  ])('fails on any other SSM error: %s', (stderr) => {
    const r = runScript('read-deployed-sha.sh', [], {
      PATH,
      FAKE_AWS_EXIT: '254',
      FAKE_AWS_STDERR: stderr,
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toBe('');
  });

  it('fails when the parameter is not a commit SHA', () => {
    const r = runScript('read-deployed-sha.sh', [], {
      PATH,
      FAKE_AWS_STDOUT: 'None\n',
    });
    expect(r.status).not.toBe(0);
  });
});

describe('prod-stack-activity.sh', () => {
  const PATH = stubAwsPath();

  it('is quiet when no stack is updating', () => {
    const r = runScript('prod-stack-activity.sh', [], {
      PATH,
      FAKE_AWS_STDOUT:
        'Data-prod\tUPDATE_COMPLETE\t2026-10-01T08:00:00.000Z\nDns-prod\tCREATE_COMPLETE\tNone\n',
    });
    expect(r).toMatchObject({ status: 0, stdout: '' });
  });

  it('reports a stack mid-update', () => {
    const r = runScript('prod-stack-activity.sh', [], {
      PATH,
      FAKE_AWS_STDOUT: 'Api-prod\tUPDATE_IN_PROGRESS\t2026-10-01T08:00:00Z\n',
    });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain('Api-prod');
  });

  it('reports a stack updated since the given time', () => {
    const since = String(Date.parse('2026-10-03T08:00:00Z') / 1000);
    const r = runScript('prod-stack-activity.sh', [since], {
      PATH,
      FAKE_AWS_STDOUT:
        'Site-prod\tUPDATE_COMPLETE\t2026-10-03T08:05:00.123000+00:00\nData-prod\tUPDATE_COMPLETE\t2026-10-01T08:00:00Z\n',
    });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain('Site-prod');
    expect(r.stdout).not.toContain('Data-prod');
  });

  it('propagates AWS errors', () => {
    const r = runScript('prod-stack-activity.sh', [], {
      PATH,
      FAKE_AWS_EXIT: '255',
    });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBe(3);
  });
});

describe('check-deploy-ancestry.sh, check-release-ref.sh and deploy-paths.sh', () => {
  const repo = tempDir();
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'ci',
        GIT_AUTHOR_EMAIL: '',
        GIT_COMMITTER_NAME: 'ci',
        GIT_COMMITTER_EMAIL: '',
      },
    }).trim();
  const commit = (file: string) => {
    mkdirSync(join(repo, dirname(file)), { recursive: true });
    writeFileSync(join(repo, file), `${file} ${Math.random()}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', file);
    return git('rev-parse', 'HEAD');
  };

  git('init', '-q', '-b', 'main');
  const base = commit('README.md');
  const docs = commit('docs/notes.md');
  const infra = commit('infra/lib/stacks/data-stack.ts');
  const web = commit('apps/web/src/main.tsx');
  const runbook = commit('infra/RUNBOOK.md');
  const goSource = commit('services/api/internal/observability/logger.go');
  const publicUi = commit('packages/public-ui/src/home/HomeBody.tsx');
  const apiStack = commit('infra/lib/stacks/api-stack.ts');
  const goLambda = commit('services/api/cmd/api/main.go');
  const publisher = commit('services/publisher/src/rebuild.ts');
  const dataPkg = commit('packages/data/src/keys.ts');
  const publisherStack = commit('infra/lib/stacks/publisher-stack.ts');
  const viewerRequest = commit(
    'infra/lib/cloudfront/viewer-request-function.js',
  );
  const siteHosting = commit('infra/lib/constructs/site-hosting.ts');
  const authStack = commit('infra/lib/stacks/auth-stack.ts');
  const ssmParams = commit('infra/lib/config/ssm-params.json');
  const ownedPaths = commit('scripts/publisher-owned-paths.generated.txt');
  const ssmNames = commit('scripts/ssm-param-name.sh');
  const uiPkg = commit('packages/ui/src/Button.tsx');
  const story = commit('apps/storybook/src/ui/Button.stories.tsx');
  const componentsStack = commit('infra/lib/stacks/components-stack.ts');
  git('checkout', '-q', '-b', 'side', base);
  const side = commit('docs/side.md');

  it('accepts a descendant and refuses a rollback', () => {
    expect(
      runScript('check-deploy-ancestry.sh', [base, web], {}, repo).status,
    ).toBe(0);
    expect(
      runScript('check-deploy-ancestry.sh', [web, base], {}, repo).status,
    ).toBe(1);
    expect(
      runScript('check-deploy-ancestry.sh', [side, web], {}, repo).status,
    ).toBe(1);
  });

  it('releases only an ios-v* tag on a commit on main', () => {
    const release = (ref: string, sha: string) =>
      runScript('check-release-ref.sh', [ref, sha, 'main'], {}, repo).status;
    expect(release('refs/tags/ios-v1.2.0', infra)).toBe(0);
    expect(release('refs/tags/ios-v1.2.0', side)).toBe(1);
    expect(release('refs/heads/main', infra)).toBe(1);
    expect(release('refs/heads/side', side)).toBe(1);
    expect(release('refs/tags/v1.2.0', infra)).toBe(1);
  });

  it('fails when the deployed SHA cannot be found, instead of deploying all', () => {
    const r = runScript(
      'check-deploy-ancestry.sh',
      ['b'.repeat(40), web],
      {},
      repo,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not in the repository/);
  });

  const deployPaths = (from: string, to: string) =>
    runScript('deploy-paths.sh', [from, to], {}, repo).stdout.split('\n');
  const paths = (from: string, to: string) =>
    deployPaths(from, to).slice(0, 2).join('\n');
  const components = (from: string, to: string) => deployPaths(from, to)[2];

  it('filters cdk and web paths', () => {
    expect(paths(base, docs)).toBe('cdk=false\nweb=false');
    expect(paths(docs, infra)).toBe('cdk=true\nweb=false');
    expect(paths(infra, web)).toBe('cdk=false\nweb=true');
    expect(paths(base, web)).toBe('cdk=true\nweb=true');
    // Markdown under infra/ never changes synth, so it doesn't redeploy.
    expect(paths(web, runbook)).toBe('cdk=false\nweb=false');
    // deployed-sha predates a cancelled infra build, so a later
    // docs-only head still deploys the stranded infra change.
    expect(paths(docs, runbook)).toBe('cdk=true\nweb=true');
    expect(paths(runbook, goSource)).toBe('cdk=true\nweb=false');
    // The public app bundles public-ui, as the publisher does.
    expect(paths(goSource, publicUi)).toBe('cdk=true\nweb=true');
    // The Admin and Notebook apps bundle packages/ui.
    expect(paths(ssmNames, uiPkg)).toBe('cdk=true\nweb=true');
    // The Storybook catalog isn't part of the site.
    expect(paths(uiPkg, story)).toBe('cdk=false\nweb=false');
  });

  it('publishes the component catalog when a story, a component or its stack changes', () => {
    expect(components(uiPkg, story)).toBe('components=true');
    expect(components(ssmNames, uiPkg)).toBe('components=true');
    expect(components(infra, web)).toBe('components=true');
    expect(components(goSource, publicUi)).toBe('components=true');
    expect(components(story, componentsStack)).toBe('components=true');
    expect(components(base, docs)).toBe('components=false');
    expect(components(docs, infra)).toBe('components=false');
    expect(components(publicUi, apiStack)).toBe('components=false');
    expect(components(goLambda, publisher)).toBe('components=false');
  });

  it('skips the web deploy for infra and API changes that the site never sees', () => {
    expect(paths(publicUi, apiStack)).toBe('cdk=true\nweb=false');
    expect(paths(publicUi, goLambda)).toBe('cdk=true\nweb=false');
  });

  // Prerendered pages only change on republishAll, and the build bakes in
  // Cognito client IDs and SSM names, so these still run the web deploy.
  it('runs the web deploy for publisher, hosting, auth and deploy-input changes', () => {
    const chain = [
      goLambda,
      publisher,
      dataPkg,
      publisherStack,
      viewerRequest,
      siteHosting,
      authStack,
      ssmParams,
    ];
    for (let i = 1; i < chain.length; i++) {
      expect(paths(chain[i - 1]!, chain[i]!)).toBe('cdk=true\nweb=true');
    }
    expect(paths(ssmParams, ownedPaths)).toBe('cdk=false\nweb=true');
    expect(paths(ownedPaths, ssmNames)).toBe('cdk=false\nweb=true');
  });
});

describe('deploy-lag.sh', () => {
  const HOUR = 3600;
  const T0 = Date.parse('2026-10-03T12:00:00Z') / 1000;
  const repo = tempDir();
  const git = (args: string[], date = T0) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'ci',
        GIT_AUTHOR_EMAIL: '',
        GIT_COMMITTER_NAME: 'ci',
        GIT_COMMITTER_EMAIL: '',
        GIT_AUTHOR_DATE: `@${date} +0000`,
        GIT_COMMITTER_DATE: `@${date} +0000`,
      },
    }).trim();
  const commit = (file: string, at: number) => {
    mkdirSync(join(repo, dirname(file)), { recursive: true });
    writeFileSync(join(repo, file), `${file} ${Math.random()}\n`);
    git(['add', '-A'], at);
    git(['commit', '-q', '-m', file], at);
    return git(['rev-parse', 'HEAD']);
  };

  git(['init', '-q', '-b', 'main']);
  const deployed = commit('README.md', T0);
  const docs = commit('docs/notes.md', T0 + 1 * HOUR);
  const infra = commit('infra/lib/stacks/api-stack.ts', T0 + 2 * HOUR);
  const runbook = commit('infra/RUNBOOK.md', T0 + 3 * HOUR);
  const web = commit('apps/web/src/main.tsx', T0 + 4 * HOUR);
  git(['checkout', '-q', '-b', 'side', deployed]);
  const side = commit('infra/lib/side.ts', T0 + 1 * HOUR);
  git(['checkout', '-q', 'main']);

  const lagAt = (now: number, base: string, head: string) => {
    const r = runScript(
      'deploy-lag.sh',
      [base, head],
      {
        NOW_EPOCH: String(now),
      },
      repo,
    );
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };

  it('alerts when a deployable change has been undeployed for over 2 hours', () => {
    const out = lagAt(T0 + 4 * HOUR + 60, deployed, infra);
    expect(out).toMatch(/^alert=true\n/);
    expect(out).toContain(infra.slice(0, 12));
    expect(out).toContain('121 min');
  });

  it('measures age from the oldest undeployed deployable commit', () => {
    // docs is older but doesn't deploy; infra is 2 h 1 min old.
    expect(lagAt(T0 + 4 * HOUR + 60, deployed, web)).toMatch(/^alert=true\n/);
    expect(lagAt(T0 + 4 * HOUR - 60, deployed, web)).toMatch(/^alert=false\n/);
  });

  it('does not alert for docs-only changes, however old', () => {
    expect(lagAt(T0 + 48 * HOUR, deployed, docs)).toMatch(/^alert=false\n/);
    // *.md under infra/ doesn't redeploy either.
    expect(lagAt(T0 + 48 * HOUR, infra, runbook)).toMatch(/^alert=false\n/);
  });

  it('does not alert for a fresh lag', () => {
    const out = lagAt(T0 + 4 * HOUR + 30 * 60, runbook, web);
    expect(out).toMatch(/^alert=false\n/);
    expect(out).toContain('30 min');
  });

  it('does not alert when prod is at main', () => {
    expect(lagAt(T0 + 48 * HOUR, web, web)).toMatch(/^alert=false\n/);
  });

  it('does not alert when a deploy finished after main was fetched', () => {
    expect(lagAt(T0 + 48 * HOUR, web, infra)).toMatch(/^alert=false\n/);
  });

  it('alerts at once when deployed-sha is not an ancestor of main', () => {
    const out = lagAt(T0 + 1 * HOUR, side, web);
    expect(out).toMatch(/^alert=true\n/);
    expect(out).toContain('not an ancestor of main');
  });

  it('alerts when deployed-sha is unknown or missing', () => {
    expect(lagAt(T0, 'b'.repeat(40), web)).toMatch(
      /^alert=true\nreason=.*not in the repository/,
    );
    expect(lagAt(T0, '', web)).toMatch(/^alert=true\nreason=.*missing/);
  });

  it('honours LAG_THRESHOLD_SECONDS', () => {
    const r = runScript(
      'deploy-lag.sh',
      [runbook, web],
      {
        NOW_EPOCH: String(T0 + 4 * HOUR + 30 * 60),
        LAG_THRESHOLD_SECONDS: String(15 * 60),
      },
      repo,
    );
    expect(r.stdout).toMatch(/^alert=true\n/);
  });
});

describe('iOS release', () => {
  const workflow = loadYaml<Workflow>(join(WORKFLOWS_DIR, 'ios-release.yml'));
  const release = workflow.jobs.build! as GatedJob;
  const submit = workflow.jobs.submit! as GatedJob;
  const environments = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'github-environments.json'), 'utf8'),
  ) as {
    environments: {
      name: string;
      deployment_branch_policy: { custom_branch_policies: boolean };
      custom_branch_policies: { name: string; type: string }[];
    }[];
  };

  it('checks the ref before installing anything', () => {
    const check = stepIndex(release, (s) =>
      (s.run ?? '').includes('scripts/ci/check-release-ref.sh'),
    );
    const setup = stepIndex(release, (s) => s.uses === SETUP_ACTION);
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(setup);
    expect(release.steps![0]!.with?.['fetch-depth']).toBe(0);
  });

  it('submits from a fresh job after the build', () => {
    expect(submit.needs).toBe('build');
    expect(submit.environment).toBe('testflight');
    expect(Object.keys(workflow.jobs).sort()).toEqual(['build', 'submit']);
  });

  it('runs in a testflight environment limited to ios-v* tags', () => {
    expect(release.environment).toBe('testflight');
    const env = environments.environments.find((e) => e.name === 'testflight');
    expect(env?.deployment_branch_policy.custom_branch_policies).toBe(true);
    expect(env?.custom_branch_policies).toEqual([
      { name: 'ios-v*', type: 'tag' },
    ]);
  });
});

describe('eas-local-build.sh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eas-local-build-'));
  const bin = join(dir, 'bin');
  const state = join(dir, 'state');
  const npmRoot = join(dir, 'global');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(bin);
  mkdirSync(join(npmRoot, 'eas-cli/node_modules/@expo/eas-build-job'), {
    recursive: true,
  });
  writeFileSync(
    join(npmRoot, 'eas-cli/node_modules/@expo/eas-build-job/package.json'),
    JSON.stringify({ version: '9.8.7' }),
  );
  const stub = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  // Like eas-cli: adds the EAS environment variables and hands the job to the
  // plugin with its own environment.
  stub(
    'eas',
    `echo "$*" >"${dir}/eas-args"
EAS_SERVER_VAR='from eas' EAS_LOCAL_BUILD_PLUGIN_INPUT=am9i "$EAS_LOCAL_BUILD_PLUGIN_PATH"`,
  );
  stub('npm', `[ "$*" = 'root -g' ] && echo "${npmRoot}"`);
  stub('npx', `{ echo "$*"; env; } >"${dir}/npx-env"`);
  const env = { PATH: `${bin}:${process.env.PATH}` };

  it('saves the job eas-cli hands over, then builds it without the token', () => {
    const prepared = runScript('eas-local-build.sh', ['prepare', state], {
      ...env,
      EXPO_TOKEN: 'tok',
    });
    expect(prepared.status, prepared.stderr).toBe(0);
    expect(readFileSync(join(dir, 'eas-args'), 'utf8').trim()).toBe(
      'build --local --platform ios --profile production --non-interactive',
    );

    const built = runScript(
      'eas-local-build.sh',
      ['build', state, join(dir, 'app.ipa')],
      { ...env, EXPO_TOKEN: '' },
    );
    expect(built.status, built.stderr).toBe(0);
    const npx = readFileSync(join(dir, 'npx-env'), 'utf8').split('\n');
    expect(npx[0]).toBe('-y eas-cli-local-build-plugin@9.8.7');
    expect(npx).toContain('EAS_LOCAL_BUILD_PLUGIN_INPUT=am9i');
    expect(npx).toContain(`EAS_LOCAL_BUILD_ARTIFACT_PATH=${dir}/app.ipa`);
    expect(npx).toContain('EAS_SERVER_VAR=from eas');
    expect(npx.filter((l) => /^EXPO_TOKEN=./.test(l))).toEqual([]);
    expect(readdirSync(state)).toEqual([]);
  });

  it('refuses to build while holding the token', () => {
    const r = runScript('eas-local-build.sh', ['build', state, 'x.ipa'], {
      ...env,
      EXPO_TOKEN: 'tok',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/without EXPO_TOKEN/);
  });

  it('fails when eas build never hands over a job', () => {
    stub('eas', 'true');
    const r = runScript('eas-local-build.sh', ['prepare', state], {
      ...env,
      EXPO_TOKEN: 'tok',
    });
    expect(r.status).toBe(1);
  });
});

describe('mobile jobs', () => {
  const mobileJobs = [
    ['mobile.yml', 'mobile'],
    ['ios-release.yml', 'build'],
  ].map(([file, jobId]) => ({
    label: `${file}#${jobId}`,
    job: loadYaml<Workflow>(join(WORKFLOWS_DIR, file!)).jobs[jobId!]!,
  }));
  const setupAction = loadYaml<{
    inputs: Record<string, { default?: string }>;
    runs: { steps: Step[] };
  }>(join(ACTIONS_DIR, 'setup', 'action.yml'));

  it('keys the setup action npm cache on its input and skips Go when asked', () => {
    const node = setupAction.runs.steps.find((s) =>
      s.uses?.startsWith('actions/setup-node@'),
    )!;
    expect(node.with).toMatchObject({
      cache: 'npm',
      'cache-dependency-path': '${{ inputs.npm-cache-dependency-path }}',
    });
    expect(setupAction.inputs['npm-cache-dependency-path']?.default).toBe(
      'package-lock.json',
    );
    const go = setupAction.runs.steps.find((s) =>
      s.uses?.startsWith('actions/setup-go@'),
    )!;
    expect(go.if).toBe("inputs.go != 'false'");
    expect(setupAction.inputs.go?.default).toBe('true');
  });

  it.each(mobileJobs)(
    '$label caches both lockfiles and sets up no Go',
    ({ job }) => {
      const setup = job.steps!.filter((s) => s.uses === SETUP_ACTION);
      expect(setup).toHaveLength(1);
      const lockfiles = String(setup[0]!.with?.['npm-cache-dependency-path'])
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      expect(lockfiles.sort()).toEqual([
        'apps/mobile/package-lock.json',
        'package-lock.json',
      ]);
      expect(setup[0]!.with?.go).toBe('false');
      expect(
        job.steps!.filter((s) => s.uses?.startsWith('actions/setup-go@')),
      ).toEqual([]);
      expect(JSON.stringify(job)).not.toMatch(/\bgo (build|test|run)\b/);
    },
  );

  it.each(mobileJobs)(
    '$label runs the shared mobile check script and no checks of its own',
    ({ job }) => {
      const runs = job.steps!.map((s) => s.run ?? '');
      expect(
        runs.filter((r) => r === 'bash scripts/ci/mobile-checks.sh'),
      ).toHaveLength(1);
      expect(runs.join('\n')).not.toMatch(
        /\bnpm (run )?(typecheck|lint|test|export:ios|check:bundle|smoke:bundle)\b/,
      );
    },
  );

  it('reruns Mobile when the check script changes', () => {
    const filter = mobileJobs[0]!.job.steps!.find((s) =>
      s.uses?.startsWith('dorny/paths-filter@'),
    );
    const paths = parse(String(filter?.with?.filters)) as Record<
      string,
      string[]
    >;
    expect(paths.mobile).toContain('scripts/ci/mobile-checks.sh');
  });

  it('typechecks and tests every package the mobile app imports', () => {
    const script = readFileSync(
      join(ROOT, 'scripts', 'ci', 'mobile-checks.sh'),
      'utf8',
    );
    const deps = Object.keys(
      (
        JSON.parse(
          readFileSync(join(ROOT, 'apps', 'mobile', 'package.json'), 'utf8'),
        ) as { dependencies: Record<string, string> }
      ).dependencies,
    ).filter((d) => d.startsWith('@gagnechris/'));
    expect(deps.length).toBeGreaterThan(0);
    for (const dep of deps) {
      expect(script).toContain(`npm run typecheck -w ${dep}`);
    }
    expect(script).toContain('npm test --prefix apps/mobile');
  });
});

describe('alert notifications', () => {
  const alertSites = [
    ['cdk.yml', 'drift'],
    ['deploy-lag-alert.yml', 'check'],
    ['main-ci-alert.yml', 'alert'],
  ] as const;

  it.each(alertSites)(
    '%s#%s alerts through notify-alerts.sh',
    (file, jobId) => {
      const job = loadYaml<Workflow>(join(WORKFLOWS_DIR, file)).jobs[jobId]!;
      expect(
        job.steps!.filter((s) => s.run?.includes(NOTIFY_ALERTS)),
      ).toHaveLength(1);
    },
  );

  it('publishes to SNS from no workflow or action directly', () => {
    for (const file of [...workflowFiles, ...actionFiles]) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/sns\s+publish|alertsTopicArn/);
    }
  });

  it('notify-alerts.sh reads the topic from SSM and publishes the message', () => {
    const bin = join(tempDir(), 'bin');
    mkdirSync(bin);
    const log = join(bin, 'calls');
    writeFileSync(
      join(bin, 'aws'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\n[ "$1" = ssm ] && printf 'arn:aws:sns:us-east-1:1:alerts\\n'\nexit 0\n`,
    );
    chmodSync(join(bin, 'aws'), 0o755);
    const r = runScript('notify-alerts.sh', ['Subject line', 'Body text'], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      'ssm get-parameter --name /gagnechris/prod/alerts-topic-arn --query Parameter.Value --output text',
      'sns publish --topic-arn arn:aws:sns:us-east-1:1:alerts --subject Subject line --message Body text',
    ]);
  });

  it('notify-alerts.sh fails when the topic cannot be read', () => {
    const r = runScript('notify-alerts.sh', ['s', 'm'], {
      PATH: stubAwsPath(),
      FAKE_AWS_EXIT: '254',
    });
    expect(r.status).not.toBe(0);
  });
});
