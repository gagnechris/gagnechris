import {
  useVersionedDocEditor,
  type VersionedDocEditorOptions,
} from '@gagnechris/app-core';
import { browserRetrySignals } from './browserRetrySignals';
import { useVersionedDocShell } from './useVersionedDocShell';

/** For non-publishable docs: no ⌘⏎ publish. */
export function useWorkspaceDocEditor<
  TEntity extends { version: number },
  TDraft,
  TParams,
>(
  options: Omit<VersionedDocEditorOptions<TEntity, TDraft, TParams>, 'confirm'>,
) {
  const editor = useVersionedDocEditor({
    ...options,
    confirm: (message) => Promise.resolve(window.confirm(message)),
    retrySignals: browserRetrySignals,
  });

  useVersionedDocShell({
    dirty: editor.dirty,
    busy: editor.busy,
    saveRef: editor.saveRef,
    suppressLeaveGuardRef: editor.suppressLeaveGuardRef,
  });

  return editor;
}
