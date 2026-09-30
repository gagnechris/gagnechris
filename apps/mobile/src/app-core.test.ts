import { useQueuedAutosave } from '@gagnechris/app-core';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

/**
 * `apps/mobile` has its own lockfile and its own React, while app-core resolves
 * the workspace-root copy. Rendering an app-core hook with this app's renderer
 * only works while a single React instance is loaded: a second copy leaves its
 * hook dispatcher null and throws (CHR-150).
 */
describe('app-core hooks under the mobile React (CHR-150)', () => {
  it('runs useQueuedAutosave with one React instance', () => {
    const states: string[] = [];

    function Host() {
      const autosave = useQueuedAutosave({
        draft: 'hello',
        dirty: false,
        setDirty: () => {},
        versionRef: { current: 1 },
        getVersion: (entity: { version: number }) => entity.version,
        performSave: async () => ({
          ok: true as const,
          entity: { version: 2 },
        }),
        onSaved: () => {},
        conflictMessage: 'conflict',
      });
      states.push(autosave.saveState);
      return null;
    }

    act(() => {
      create(createElement(Host));
    });

    expect(states).toEqual(['idle']);
  });
});
