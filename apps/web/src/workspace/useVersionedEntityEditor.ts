import {
  useVersionedEntityEditor as useVersionedEntityEditorCore,
  type VersionedEntityEditorOptions,
} from '@gagnechris/app-core';
import { browserRetrySignals } from './browserRetrySignals';
import { browserConfirm, useVersionedDocShell } from './useVersionedDocShell';

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
    confirm: browserConfirm,
    retrySignals: browserRetrySignals,
  });

  useVersionedDocShell({
    dirty: editor.dirty,
    busy: editor.busy,
    save: editor.save,
    suppressLeaveGuardRef: editor.suppressLeaveGuardRef,
    publish: editor.runPublish,
  });

  return editor;
}
