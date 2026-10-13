import { useId, useMemo, useRef, useState } from 'react';
import { taskEmbedIds } from '@gagnechris/shared';
import {
  setNotePeek,
  setTaskDetailsOpen,
  useTaskDetailsStore,
} from './taskDetailsStore';

/** Expand or collapse every task's details in the note. */
export function NoteDetailsToggle({ markdown }: { markdown: string }) {
  const ids = useMemo(() => taskEmbedIds(markdown), [markdown]);
  const { open } = useTaskDetailsStore();
  if (ids.length === 0) return null;
  const anyOpen = ids.some((id) => open.has(id));
  return (
    <button
      type="button"
      className="kit-btn"
      onClick={() => setTaskDetailsOpen(ids, !anyOpen)}
    >
      {anyOpen ? 'Collapse details' : 'Expand details'}
    </button>
  );
}

/** The note's ⋯ menu: how task rows show, and Delete. */
export function NoteMenu({
  noteId,
  onDelete,
  deleteDisabled,
}: {
  noteId: string;
  /** Without it there is no Delete note item. */
  onDelete?: () => void;
  deleteDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { peek } = useTaskDetailsStore();
  const peeking = peek.has(noteId);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  return (
    <span
      className="note-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          close(false);
        }
      }}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.preventDefault();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="kit-btn note-menu__trigger"
        aria-label="Note options"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div id={menuId} className="note-menu__panel">
          <fieldset className="note-menu__group">
            <legend>Task rows</legend>
            <label className="kit-check">
              <input
                type="radio"
                name={`${menuId}-peek`}
                checked={!peeking}
                onChange={() => setNotePeek(noteId, false)}
              />
              Title only
            </label>
            <label className="kit-check">
              <input
                type="radio"
                name={`${menuId}-peek`}
                checked={peeking}
                onChange={() => setNotePeek(noteId, true)}
              />
              Title and first line
            </label>
          </fieldset>
          {onDelete ? (
            <button
              type="button"
              className="note-menu__item note-menu__item--danger"
              disabled={deleteDisabled}
              onClick={() => {
                close(true);
                onDelete();
              }}
            >
              Delete note
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
