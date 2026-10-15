import { useMemo, useRef, useState } from 'react';
import type { NoteTemplate } from '@gagnechris/app-core';
import { taskEmbedIds } from '@gagnechris/shared';
import {
  Button,
  IconButton,
  Menu,
  MenuItem,
  MenuRadioGroup,
  MenuSeparator,
} from '@gagnechris/ui';
import ShellIcon from '../workspace/ui/ShellIcon';
import { NoteTemplatePicker } from './NoteTemplatePicker';
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
    <Button onClick={() => setTaskDetailsOpen(ids, !anyOpen)}>
      {anyOpen ? 'Collapse details' : 'Expand details'}
    </Button>
  );
}

const TASK_ROWS = [
  { value: 'title', label: 'Title only' },
  { value: 'peek', label: 'Title and first line' },
] as const;

/** The note's ⋯ menu: how task rows show, Insert template…, Archive, and Delete. */
export function NoteMenu({
  noteId,
  archived,
  onArchivedChange,
  onDelete,
  deleteDisabled,
  onInsertTemplate,
}: {
  noteId: string;
  archived?: boolean;
  /** Without it there is no Archive item. */
  onArchivedChange?: (archived: boolean) => void;
  /** Without it there is no Delete note item. */
  onDelete?: () => void;
  deleteDisabled?: boolean;
  /** Without it there is no Insert template… item. */
  onInsertTemplate?: (template: NoteTemplate) => void;
}) {
  const [picking, setPicking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { peek } = useTaskDetailsStore();
  const peeking = peek.has(noteId);

  const stopPicking = (refocus: boolean) => {
    setPicking(false);
    if (refocus) triggerRef.current?.focus();
  };

  return (
    <span
      className="note-menu"
      onBlur={(e) => {
        if (
          picking &&
          !e.currentTarget.contains(e.relatedTarget as Node | null)
        ) {
          stopPicking(false);
        }
      }}
      onKeyDown={(e) => {
        if (picking && e.key === 'Escape') {
          e.preventDefault();
          stopPicking(true);
        }
      }}
    >
      <Menu
        label="Note options"
        align="end"
        trigger={({ ref, ...props }) => (
          <IconButton
            {...props}
            ref={(el) => {
              ref(el);
              triggerRef.current = el;
            }}
            variant="outline"
            label="Note options"
          >
            <ShellIcon name="more" />
          </IconButton>
        )}
      >
        <MenuRadioGroup
          label="Task rows"
          options={TASK_ROWS}
          value={peeking ? 'peek' : 'title'}
          onChange={(value) => setNotePeek(noteId, value === 'peek')}
        />
        {onInsertTemplate || onArchivedChange || onDelete ? (
          <MenuSeparator />
        ) : null}
        {onInsertTemplate ? (
          <MenuItem onSelect={() => setPicking(true)}>
            Insert template…
          </MenuItem>
        ) : null}
        {onArchivedChange ? (
          <MenuItem onSelect={() => onArchivedChange(!archived)}>
            {archived ? 'Unarchive note' : 'Archive note'}
          </MenuItem>
        ) : null}
        {onDelete ? (
          <MenuItem danger disabled={deleteDisabled} onSelect={onDelete}>
            Delete note
          </MenuItem>
        ) : null}
      </Menu>
      {picking && onInsertTemplate ? (
        <div className="note-menu__panel">
          <NoteTemplatePicker
            onChoose={(template) => {
              stopPicking(false);
              onInsertTemplate(template);
            }}
          />
        </div>
      ) : null}
    </span>
  );
}
