import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { VersionedEntityActionBarProps } from '@gagnechris/app-core';
import { Button } from '../../kit/Button';
import {
  EditorActionBar,
  type EditorActionBarProps,
} from '../../workspace/ui/EditorActionBar';

type BackLink = { to: string; label: string };

export function EditorNotice({
  message,
  back,
}: {
  message: string;
  back?: BackLink;
}) {
  return (
    <section className="admin-panel">
      <p className="admin-panel__error" role="alert">
        {message}
      </p>
      {back ? <Link to={back.to}>{back.label}</Link> : null}
    </section>
  );
}

export function EditorError({ message }: { message: string | null }) {
  return message ? (
    <p className="admin-panel__error" role="alert">
      {message}
    </p>
  ) : null;
}

type FrameEditor<TEntity> = {
  entity: TEntity | null;
  loadError: string | null;
  isLoading: boolean;
  saveError: string | null;
  busy: boolean;
  actionBarProps: VersionedEntityActionBarProps;
  canDelete: boolean;
  runDelete: () => Promise<void>;
};

type Props<TEntity> = {
  editor: FrameEditor<TEntity>;
  leading: ReactNode;
  loadingLabel: string;
  /** Shown under a load error. */
  back?: BackLink;
  viewLiveHref: (entity: TEntity) => string | null;
  actionBar?: Partial<EditorActionBarProps>;
  /** Alerts shown above the save error. */
  notices?: ReactNode;
  /** The page shows `saveError` itself, with `EditorError`. */
  placesSaveError?: boolean;
  children: (entity: TEntity) => ReactNode;
};

/** Load and error states, the action bar and the save error around an editor. */
export function EditorFrame<TEntity>({
  editor,
  leading,
  loadingLabel,
  back,
  viewLiveHref,
  actionBar,
  notices,
  placesSaveError = false,
  children,
}: Props<TEntity>) {
  const { entity } = editor;

  if (editor.loadError) {
    return <EditorNotice message={editor.loadError} back={back} />;
  }

  if (editor.isLoading || !entity) {
    return (
      <section className="admin-panel">
        <p>{loadingLabel}</p>
      </section>
    );
  }

  return (
    <section className="admin-panel admin-panel--editor">
      <EditorActionBar
        leading={leading}
        {...editor.actionBarProps}
        viewLiveHref={viewLiveHref(entity)}
        extraActions={
          editor.canDelete ? (
            <Button
              variant="danger"
              disabled={editor.busy}
              onClick={() => void editor.runDelete()}
            >
              Delete
            </Button>
          ) : null
        }
        {...actionBar}
      />
      {notices}
      {placesSaveError ? null : <EditorError message={editor.saveError} />}
      {children(entity)}
    </section>
  );
}
