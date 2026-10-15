import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { VersionedEntityActionBarProps } from '@gagnechris/app-core';
import { Button, IconButton, StatusBadge } from '@gagnechris/ui';
import ShellIcon from './ShellIcon';
import { SaveIndicator } from './SaveIndicator';

export type EditorActionBarProps = VersionedEntityActionBarProps & {
  leading?: ReactNode;
  viewLiveHref?: string | null;
  extraActions?: ReactNode;
  menuActions?: ReactNode;
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
  menuActions,
}: EditorActionBarProps) {
  const showPublish = status === 'draft' || hasUnpublishedChanges;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const actions = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

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
    <div className="workspace-action-bar">
      <div className="workspace-action-bar__status">
        {leading}
        <StatusBadge
          status={status}
          hasUnpublishedChanges={hasUnpublishedChanges}
        />
        <SaveIndicator saveState={saveState} dirty={dirty} />
      </div>
      <div className="workspace-actions" ref={actions}>
        {/* Phones only: the secondary actions fold into this menu. */}
        <IconButton
          ref={toggle}
          label="More actions"
          size="lg"
          className="workspace-actions__toggle"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ShellIcon name="more" />
        </IconButton>
        <div
          id={menuId}
          className="workspace-actions__more"
          data-open={menuOpen || undefined}
          onClick={(event) => {
            if (menuOpen && (event.target as Element).closest('a, button')) {
              setMenuOpen(false);
              // The menu hides; a sheet the action opens returns focus here.
              toggle.current?.focus();
            }
          }}
        >
          {menuActions}
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
            <kbd className="workspace-action-kbd" aria-hidden="true">
              ⌘⏎
            </kbd>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
