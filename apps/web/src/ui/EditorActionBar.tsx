import type { ReactNode } from 'react';
import type { SaveState } from '../admin/useQueuedAutosave';
import { Button } from './Button';
import { SaveIndicator } from './SaveIndicator';
import { StatusBadge } from './StatusBadge';

export type EditorActionBarProps = {
  /** Leading status row content (back link, page title, etc.). */
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
  /** Optional extra actions (e.g. Delete). */
  extraActions?: ReactNode;
};

/** Shared sticky Publish / Unpublish / Discard / Save bar for draft editors. */
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
        {viewLiveHref ? <Button href={viewLiveHref}>View live</Button> : null}
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
