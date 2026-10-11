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
>({
  hasUnsavedFields,
  ...options
}: Omit<VersionedEntityEditorOptions<TEntity, TDraft, TParams>, 'confirm'> & {
  /** Fields the payload leaves out as typed (invalid), which a save cannot store. */
  hasUnsavedFields?: (draft: TDraft) => boolean;
}) {
  const editor = useVersionedEntityEditorCore({
    ...options,
    confirm: browserConfirm,
    retrySignals: browserRetrySignals,
  });
  const unsavedFields = hasUnsavedFields?.(editor.draft) ?? false;

  useVersionedDocShell({
    dirty: editor.dirty,
    unsavedFields,
    busy: editor.busy,
    save: editor.save,
    suppressLeaveGuardRef: editor.suppressLeaveGuardRef,
    publish: editor.runPublish,
  });

  return { ...editor, unsavedFields };
}
