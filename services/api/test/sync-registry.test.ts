import { describe, expect, it, vi } from 'vitest';
import { SYNC_CHANGE_TYPES } from '@gagnechris/shared';

describe('sync adapter registration', () => {
  it('a cold import of the production route table registers every SyncChangeSchema type', async () => {
    // Fresh module graph: no repository constructed, no test setup registered.
    vi.resetModules();
    const registry = await import('../src/sync/registry.js');
    expect(registry.listSyncChangeTypes()).toEqual([]);

    await import('../src/routes.js');

    expect([...registry.listSyncChangeTypes()].sort()).toEqual(
      [...SYNC_CHANGE_TYPES].sort(),
    );
    for (const changeType of SYNC_CHANGE_TYPES) {
      expect(registry.getSyncAdapter(changeType)?.changeType).toBe(changeType);
    }
  });

  it('constructing a repository does not register adapters', async () => {
    vi.resetModules();
    const registry = await import('../src/sync/registry.js');
    const { NotesRepository } = await import('../src/notes/repository.js');
    const { TasksRepository } = await import('../src/tasks/repository.js');
    const { createMemoryDoc } = await import('./support/memory-doc.js');
    const { doc } = createMemoryDoc();
    new NotesRepository(doc, 'gagnechris-test');
    new TasksRepository(doc, 'gagnechris-test');
    expect(registry.listSyncChangeTypes()).toEqual([]);
  });
});
