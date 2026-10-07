import { vi } from 'vitest';
import type { syncViewerRequestKeys } from '../../src/viewer-request-slugs.js';

type Sync = typeof syncViewerRequestKeys;

/** The keys the last sync of `namespace` asked for, resolved now. */
export async function desiredKvsKeys(
  sync: Sync,
  namespace: 'blog' | 'project',
): Promise<string[]> {
  const call = vi
    .mocked(sync)
    .mock.calls.filter(([ns]) => ns.label === namespace)
    .at(-1);
  if (!call) throw new Error(`no ${namespace} KVS sync`);
  const keys = call[1];
  return typeof keys === 'function' ? keys() : keys;
}

export const kvsSyncCount = (sync: Sync, namespace: 'blog' | 'project') =>
  vi.mocked(sync).mock.calls.filter(([ns]) => ns.label === namespace).length;
