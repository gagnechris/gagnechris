import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  VersionedEditorEntity,
  VersionedEntityEditorOptions,
} from '@gagnechris/app-core';
import { useVersionedEntityEditor } from '../../workspace/useVersionedEntityEditor';

const SLUG_TAKEN_MESSAGE =
  'That slug is already taken. Choose a different slug.';

type Options<TEntity extends VersionedEditorEntity, TDraft, TParams> = Omit<
  VersionedEntityEditorOptions<TEntity, TDraft, TParams>,
  'confirm' | 'conflictMessage' | 'slugTakenMessage' | 'delete' | 'onHydrate'
> & {
  /** Completes "another save updated …", e.g. "this post". */
  subject: string;
  uniqueSlug?: boolean;
  delete?: {
    confirm: string;
    mutate: (version: number) => Promise<void>;
    /** Where the editor goes once the entity is deleted. */
    redirectTo: string;
  };
};

export function useAdminEntityEditor<
  TEntity extends VersionedEditorEntity,
  TDraft,
  TParams,
>({
  subject,
  uniqueSlug,
  delete: deleteOptions,
  ...options
}: Options<TEntity, TDraft, TParams>) {
  const navigate = useNavigate();
  // Lets useDraftFields reset per-entity state when the editor (re)hydrates.
  const [hydrated, setHydrated] = useState<TEntity | null>(null);

  const editor = useVersionedEntityEditor({
    ...options,
    conflictMessage: `Conflict — another save updated ${subject}. Reload and try again.`,
    slugTakenMessage: uniqueSlug ? SLUG_TAKEN_MESSAGE : undefined,
    onHydrate: setHydrated,
    delete: deleteOptions && {
      confirm: deleteOptions.confirm,
      mutate: deleteOptions.mutate,
      onDeleted: () => {
        void navigate(deleteOptions.redirectTo);
      },
    },
  });

  return { ...editor, hydrated, canDelete: deleteOptions !== undefined };
}
