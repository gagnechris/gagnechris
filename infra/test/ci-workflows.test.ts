import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  with?: Record<string, unknown>;
}

interface Job {
  name?: string;
  permissions?: Record<string, string> | string;
  steps?: Step[];
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
}

interface Workflow {
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

function stepIndex(job: Job, predicate: (step: Step) => boolean): number {
  return (job.steps ?? []).findIndex(predicate);
}

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

  it('never runs install scripts in a job that can mint an OIDC token', () => {
    const offenders: string[] = [];
    for (const { path, doc } of workflows) {
      for (const [jobId, job] of Object.entries(doc.jobs)) {
        if (!hasIdToken(job, doc)) continue;
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
    expect(steps.some((s) => s.run?.includes('aws sns publish'))).toBe(true);
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
      (s) => s.run?.includes('aws sns publish') ?? false,
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

describe('check-deploy-ancestry.sh and deploy-paths.sh', () => {
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

  it('filters cdk and web paths', () => {
    const paths = (from: string, to: string) =>
      runScript('deploy-paths.sh', [from, to], {}, repo).stdout;
    expect(paths(base, docs)).toBe('cdk=false\nweb=false');
    expect(paths(docs, infra)).toBe('cdk=true\nweb=false');
    expect(paths(infra, web)).toBe('cdk=false\nweb=true');
    expect(paths(base, web)).toBe('cdk=true\nweb=true');
    // Markdown under infra/ never changes synth, so it doesn't redeploy.
    expect(paths(web, runbook)).toBe('cdk=false\nweb=false');
    // CHR-149: deployed-sha predates a cancelled infra build, so a later
    // docs-only head still deploys the stranded infra change.
    expect(paths(docs, runbook)).toBe('cdk=true\nweb=true');
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
