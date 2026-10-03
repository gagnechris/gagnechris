import {
  useVersionedEntityEditor as useVersionedEntityEditorCore,
  type VersionedEntityEditorOptions,
} from '@gagnechris/app-core';
import { browserRetrySignals } from './browserRetrySignals';
import { useVersionedDocShell } from './useVersionedDocShell';

/**
 * Web shell around app-core draft/publish editors: injects `window.confirm`
 * and wires leave guards + ⌘S / ⌘⏎ via `useVersionedDocShell` (CHR-173).
 */
export function useVersionedEntityEditor<
  TEntity extends {
    version: number;
    status: 'draft' | 'published' | 'deleted';
    hasUnpublishedChanges: boolean;
  },
  TDraft,
  TParams,
>(
  options: Omit<
    VersionedEntityEditorOptions<TEntity, TDraft, TParams>,
    'confirm'
  >,
) {
  const editor = useVersionedEntityEditorCore({
    ...options,
    confirm: (message) => Promise.resolve(window.confirm(message)),
    retrySignals: browserRetrySignals,
  });

  useVersionedDocShell({
    dirty: editor.dirty,
    busy: editor.busy,
    saveRef: editor.saveRef,
    suppressLeaveGuardRef: editor.suppressLeaveGuardRef,
    publishRef: editor.publishRef,
  });

  return editor;
}
