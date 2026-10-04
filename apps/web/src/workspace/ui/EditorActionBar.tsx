import type { ReactNode } from 'react';
import type { SaveState } from '@gagnechris/app-core';
import { Button } from '../../kit/Button';
import { SaveIndicator } from './SaveIndicator';
import { StatusBadge } from '../../kit/StatusBadge';

export type EditorActionBarProps = {
  leading?: ReactNode;
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges: boolean;
  saveState: SaveState;
  dirty: boolean;
  busy: boolean;
  viewLiveHref?: string | null;
  onPublish: () => void;
  onUnpublish: () => void;
  onDiscard: () => void;
  onSave: () => void;
  extraActions?: ReactNode;
};

export function EditorActionBar({
  leading,
  status,
  hasUnpublishedChanges,
  saveState,
  dirty,
  busy,
  viewLiveHref,
  onPublish,
  onUnpublish,
  onDiscard,
  onSave,
  extraActions,
}: EditorActionBarProps) {
  const showPublish = status === 'draft' || hasUnpublishedChanges;

  return (
    <div className="admin-action-bar">
      <div className="admin-action-bar__status">
        {leading}
        <StatusBadge
          status={status}
          hasUnpublishedChanges={hasUnpublishedChanges}
        />
        <SaveIndicator saveState={saveState} dirty={dirty} />
      </div>
      <div className="admin-actions">
        {viewLiveHref ? (
          <Button href={viewLiveHref} target="_blank" rel="noopener noreferrer">
            View live
          </Button>
        ) : null}
        {showPublish ? (
          <Button variant="primary" disabled={busy} onClick={onPublish}>
            {hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
          </Button>
        ) : null}
        {hasUnpublishedChanges ? (
          <Button disabled={busy} onClick={onDiscard}>
            Discard changes
          </Button>
        ) : null}
        {status === 'published' ? (
          <Button disabled={busy} onClick={onUnpublish}>
            Unpublish
          </Button>
        ) : null}
        <Button disabled={busy || !dirty} onClick={onSave}>
          Save
        </Button>
        {extraActions}
      </div>
    </div>
  );
}
