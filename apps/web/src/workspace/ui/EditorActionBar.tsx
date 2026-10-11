import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { VersionedEntityActionBarProps } from '@gagnechris/app-core';
import { Button } from '../../kit/Button';
import { SaveIndicator } from './SaveIndicator';
import { StatusBadge } from '../../kit/StatusBadge';

export type EditorActionBarProps = VersionedEntityActionBarProps & {
  leading?: ReactNode;
  viewLiveHref?: string | null;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const actions = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!actions.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

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
      <div className="admin-actions" ref={actions}>
        {/* Phones only: the secondary actions fold into this menu. */}
        <button
          type="button"
          className="admin-actions__toggle"
          aria-label="More actions"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">…</span>
        </button>
        <div
          id={menuId}
          className="admin-actions__more"
          data-open={menuOpen || undefined}
          onClick={(event) => {
            if ((event.target as Element).closest('a, button')) {
              setMenuOpen(false);
            }
          }}
        >
          {extraActions}
          {viewLiveHref ? (
            <Button
              href={viewLiveHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              View live
            </Button>
          ) : null}
          {status === 'published' ? (
            <Button disabled={busy} onClick={onUnpublish}>
              Unpublish
            </Button>
          ) : null}
          {hasUnpublishedChanges ? (
            <Button disabled={busy} onClick={onDiscard}>
              Discard changes
            </Button>
          ) : null}
          <Button disabled={busy || !dirty} onClick={onSave}>
            Save
          </Button>
        </div>
        {showPublish ? (
          <Button variant="primary" disabled={busy} onClick={onPublish}>
            {hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
            <kbd className="admin-kbd" aria-hidden="true">
              ⌘⏎
            </kbd>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
