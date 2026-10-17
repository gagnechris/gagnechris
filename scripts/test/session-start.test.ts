import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, '.claude', 'hooks', 'session-start.sh');

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const FAKE_NVM = `
nvm() {
  case "$1" in
    install)
      mkdir -p "$NVM_DIR/versions/node/v$2/bin"
      printf '#!/bin/sh\\n' > "$NVM_DIR/versions/node/v$2/bin/node"
      chmod +x "$NVM_DIR/versions/node/v$2/bin/node" ;;
    which) echo "$NVM_DIR/versions/node/v$2/bin/node" ;;
  esac
}
`;

function runHook(gitClone: 'works' | 'fails') {
  const dir = mkdtempSync(join(tmpdir(), 'session-start-'));
  roots.push(dir);
  const bin = join(dir, 'bin');
  const nvmDir = join(dir, 'nvm');
  const log = join(dir, 'calls.log');
  const envFile = join(dir, 'env');
  mkdirSync(bin);
  mkdirSync(nvmDir);
  writeFileSync(envFile, '');
  writeFileSync(join(dir, 'nvm.sh'), FAKE_NVM);
  const stub = (name: string, body = '') => {
    writeFileSync(
      join(bin, name),
      `#!/usr/bin/env bash\necho "${name} $*" >> '${log}'\n${body}\n`,
    );
    chmodSync(join(bin, name), 0o755);
  };
  stub(
    'git',
    gitClone === 'works'
      ? `dest="\${@: -1}"; mkdir -p "$dest"; cp '${join(dir, 'nvm.sh')}' "$dest/nvm.sh"`
      : 'exit 128',
  );
  for (const name of ['npm', 'go', 'docker', 'dockerd', 'sudo', 'rsync']) {
    stub(name);
  }
  const r = spawnSync('bash', [HOOK], {
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: dir,
      CLAUDE_CODE_REMOTE: 'true',
      CLAUDE_PROJECT_DIR: ROOT,
      CLAUDE_ENV_FILE: envFile,
      NVM_DIR: nvmDir,
    },
    encoding: 'utf8',
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8') : '';
  return { ...r, calls, env: readFileSync(envFile, 'utf8'), nvmDir };
}

describe('.claude/hooks/session-start.sh', () => {
  it('installs nvm when the image has none, then Node and the dependencies', () => {
    const r = runHook('works');
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls).toMatch(
      /^git .*--branch v\d+\.\d+\.\d+ .*nvm-sh\/nvm\.git/m,
    );
    const nodeBin = join(r.nvmDir, 'versions/node/v22/bin');
    expect(r.env).toContain(`export PATH="${nodeBin}:$PATH"`);
    expect(r.calls).toContain('npm ci --no-audit --no-fund');
    expect(r.calls).toContain('npm ci --prefix apps/mobile');
  });

  it('still sets up Go and Docker when Node cannot be installed', () => {
    const r = runHook('fails');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not install Node/);
    expect(r.calls).not.toMatch(/^npm /m);
    expect(r.calls).toMatch(/^go -C services\/api mod download/m);
    expect(r.calls).toMatch(/^docker info/m);
  });
});
