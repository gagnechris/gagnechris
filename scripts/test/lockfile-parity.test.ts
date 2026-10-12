import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  lockfileParityErrors,
  repoLockfileParityErrors,
  type Lockfile,
} from '../lockfile-parity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const shared = {
  dir: 'packages/shared',
  manifest: {
    name: '@gagnechris/shared',
    dependencies: { marked: '18.1.0', dompurify: '^3.0.0', zod: '^4.0.0' },
  },
};

const appCore = {
  dir: 'packages/app-core',
  manifest: {
    name: '@gagnechris/app-core',
    dependencies: { '@gagnechris/shared': '*' },
    peerDependencies: { '@tanstack/react-query': '^5.0.0' },
  },
};

const lock = (packages: Lockfile['packages']): Lockfile => ({ packages });
const webOnly = (name: string) => name === 'dompurify';

describe('lockfile parity', () => {
  const rootLock = lock({
    'node_modules/marked': { version: '18.1.0' },
    'node_modules/dompurify': { version: '3.4.16' },
    'node_modules/zod': { version: '4.6.5' },
    'node_modules/@tanstack/react-query': {
      version: '5.104.1',
      dependencies: { '@tanstack/query-core': '5.104.1' },
    },
    'node_modules/@tanstack/query-core': { version: '5.104.1' },
  });
  const mobileLock = lock({
    'node_modules/marked': { version: '18.1.0' },
    'node_modules/zod': { version: '4.6.5' },
    'node_modules/@tanstack/react-query': {
      version: '5.104.1',
      dependencies: { '@tanstack/query-core': '5.104.1' },
    },
    'node_modules/@tanstack/query-core': { version: '5.104.1' },
  });

  it('passes when both installs agree, leaving out web-only deps', () => {
    expect(
      lockfileParityErrors(rootLock, mobileLock, [shared, appCore], webOnly),
    ).toEqual([]);
  });

  it('names a direct dependency the two lockfiles resolve differently', () => {
    const drifted = lock({
      ...mobileLock.packages,
      'node_modules/marked': { version: '18.0.14' },
    });
    expect(
      lockfileParityErrors(rootLock, drifted, [shared, appCore], webOnly),
    ).toEqual([
      'marked (via @gagnechris/shared): 18.1.0 in the root lockfile, 18.0.14 in apps/mobile',
    ]);
  });

  it('follows peer and transitive dependencies', () => {
    const drifted = lock({
      ...mobileLock.packages,
      'node_modules/@tanstack/query-core': { version: '5.104.0' },
    });
    expect(lockfileParityErrors(rootLock, drifted, [appCore], webOnly)).toEqual(
      [
        '@tanstack/query-core (via @tanstack/react-query): 5.104.1 in the root lockfile, 5.104.0 in apps/mobile',
      ],
    );
  });

  it('prefers a copy nested under the workspace in the root lockfile', () => {
    const nested = lock({
      ...rootLock.packages,
      'packages/shared/node_modules/marked': { version: '17.0.0' },
    });
    expect(lockfileParityErrors(nested, mobileLock, [shared], webOnly)).toEqual(
      [
        'marked (via @gagnechris/shared): 17.0.0 in the root lockfile, 18.1.0 in apps/mobile',
      ],
    );
  });

  it('requires every app-bundled dependency in the mobile lockfile', () => {
    const { ['node_modules/zod']: _zod, ...rest } = mobileLock.packages;
    expect(
      lockfileParityErrors(rootLock, lock(rest), [shared], webOnly),
    ).toEqual([
      '@gagnechris/shared: zod is not in apps/mobile/package-lock.json',
    ]);
  });

  it('holds for the repo lockfiles', () => {
    expect(
      repoLockfileParityErrors(ROOT, (name) =>
        ['dompurify', 'sanitize-html'].includes(name),
      ),
    ).toEqual([]);
  });
});
