import {
  useVersionedDocEditor,
  type VersionedDocEditorOptions,
} from '@gagnechris/app-core';
import { browserRetrySignals } from './browserRetrySignals';
import { browserConfirm, useVersionedDocShell } from './useVersionedDocShell';

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
    confirm: browserConfirm,
    retrySignals: browserRetrySignals,
  });

  useVersionedDocShell({
    dirty: editor.dirty,
    busy: editor.busy,
    save: editor.save,
    suppressLeaveGuardRef: editor.suppressLeaveGuardRef,
  });

  return editor;
}
