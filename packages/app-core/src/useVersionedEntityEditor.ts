import { useCallback } from 'react';
import type { ConfirmFn, RetrySignals } from './platform.js';
import type { DraftPublishResource } from './query/createDraftPublishResource.js';
import {
  useDraftPublishEditor,
  type DraftPublishEditorOptions,
} from './useDraftPublishEditor.js';
import type { SaveState } from './useQueuedAutosave.js';
import {
  useVersionedDocController,
  type VersionedDocDeleteOptions,
  type VersionedDocEntity,
} from './useVersionedDocEditor.js';

export type VersionedEditorEntity = VersionedDocEntity & {
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges: boolean;
};

export type VersionedEntityEditorOptions<
  TEntity extends VersionedEditorEntity,
  TDraft,
  TParams,
> = {
  resource: DraftPublishResource<TEntity, TParams>;
  params: TParams;
  enabled?: boolean;
  initialDraft: TDraft;
  toDraft: (entity: TEntity) => TDraft;
  /** Lets remounted cache rows re-hydrate once per entity. */
  getEntityId: (entity: TEntity) => string;
  toPayload: (draft: TDraft, entity: TEntity) => Record<string, unknown>;
  conflictMessage: string;
  slugTakenMessage?: string;
  confirm: ConfirmFn;
  unpublishConfirm: string;
  discardConfirm: string;
  loadErrorFallback?: string;
  delete?: VersionedDocDeleteOptions;
  onHydrate?: (entity: TEntity) => void;
  retrySignals?: RetrySignals;
  beforePublish?: DraftPublishEditorOptions<TEntity>['beforePublish'];
};

export type VersionedEntityActionBarProps = {
  status: VersionedEditorEntity['status'];
  hasUnpublishedChanges: boolean;
  saveState: SaveState;
  dirty: boolean;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

/** Non-publishable entities should call `useVersionedDocEditor` directly. */
export function useVersionedEntityEditor<
  TEntity extends VersionedEditorEntity,
  TDraft,
  TParams,
>({
  resource,
  params,
  enabled = true,
  initialDraft,
  toDraft,
  getEntityId,
  toPayload,
  conflictMessage,
  slugTakenMessage,
  confirm,
  unpublishConfirm,
  discardConfirm,
  loadErrorFallback = 'Could not load content.',
  delete: deleteOpts,
  onHydrate,
  retrySignals,
  beforePublish,
}: VersionedEntityEditorOptions<TEntity, TDraft, TParams>) {
  const lifecycle = resource.useLifecycleMutators(params);

  const { editor, controller } = useVersionedDocController({
    resource,
    params,
    enabled,
    initialDraft,
    toDraft,
    getEntityId,
    toPayload,
    conflictMessage,
    conflictMessages: slugTakenMessage
      ? { slug_taken: slugTakenMessage }
      : undefined,
    confirm,
    loadErrorFallback,
    delete: deleteOpts,
    onHydrate,
    retrySignals,
  });
  const { getBoundVersion } = controller;

  const publish = useCallback(
    () => lifecycle.publish({ version: getBoundVersion() }),
    [lifecycle.publish, getBoundVersion],
  );
  const unpublish = useCallback(
    () => lifecycle.unpublish({ version: getBoundVersion() }),
    [lifecycle.unpublish, getBoundVersion],
  );
  const discard = useCallback(
    () => lifecycle.discard({ version: getBoundVersion() }),
    [lifecycle.discard, getBoundVersion],
  );

  const { runPublish, runUnpublish, runDiscard } = useDraftPublishEditor({
    autosave: controller.autosave,
    doc: controller.doc,
    hold: controller.hold,
    requests: { publish, unpublish, discard },
    confirm,
    confirmMessages: { unpublish: unpublishConfirm, discard: discardConfirm },
    enabled,
    beforePublish,
  });

  const actionBarProps: VersionedEntityActionBarProps = {
    status: editor.entity?.status ?? 'draft',
    hasUnpublishedChanges: editor.entity?.hasUnpublishedChanges ?? false,
    saveState: editor.saveState,
    dirty: editor.dirty,
    busy: editor.busy,
    onPublish: () => {
      void runPublish();
    },
    onUnpublish: () => {
      void runUnpublish();
    },
    onDiscard: () => {
      void runDiscard();
    },
    onSave: () => {
      void editor.save();
    },
  };

  const { boundVersion: _boundVersion, ...rest } = editor;
  return { ...rest, actionBarProps, runPublish };
}
