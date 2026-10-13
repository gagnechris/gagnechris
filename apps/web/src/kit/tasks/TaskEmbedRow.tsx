import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  NOTEBOOK_TITLE_MAX_LENGTH,
  type Task,
  type TaskDue,
} from '@gagnechris/shared';
import { TaskDuePill } from './TaskDuePill';

export type TaskEmbedView =
  | { kind: 'loading' }
  | { kind: 'deleted' }
  | { kind: 'failed'; title: string; onRetry: () => void }
  | {
      kind: 'task';
      task: Pick<Task, 'title' | 'status' | 'priority'>;
      /** Short label such as `@Tue`; omitted when unscheduled. */
      schedule?: string;
      due?: TaskDue | null;
      /** Not saved yet, so it cannot be toggled. */
      pending?: boolean;
      onToggle: () => void;
      /** Without it the title is read-only. */
      onRename?: (title: string) => void;
      /** Without a route there is no "open task" link. */
      to?: string;
    };

/** Returns focus to the surrounding editor: below the row, or onto its line. */
export type TaskEmbedLeave = (below: boolean) => void;

/** Deletes the row's line from the note, which deletes its task. */
export type TaskEmbedDelete = () => void;

/** Arrow keys out of the title, to the line or row above or below. */
export type TaskEmbedMove = (dir: 'up' | 'down') => void;

export type TaskEmbedDetails = {
  open: boolean;
  onToggle: () => void;
  hasDescription: boolean;
  /** The description's first line, shown under the closed row. */
  peek: string | null;
  /** Rendered under the row while open. */
  panel: ReactNode;
};

const isToggleKey = (e: KeyboardEvent) =>
  e.key === '.' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;

const PRIORITY_LABEL: Record<Task['priority'], string | null> = {
  high: 'High',
  med: null,
  low: 'Low',
};

function TaskEmbedTitle({
  title,
  onRename,
  onLeave,
  onDelete,
  onMove,
  onToggleDetails,
}: {
  title: string;
  onRename: (title: string) => void;
  onLeave?: TaskEmbedLeave;
  onDelete?: TaskEmbedDelete;
  onMove?: TaskEmbedMove;
  onToggleDetails?: () => void;
}) {
  // Null while not editing, so a rename from elsewhere shows at once.
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const onRenameRef = useRef(onRename);
  const titleRef = useRef(title);
  useEffect(() => {
    onRenameRef.current = onRename;
    titleRef.current = title;
  }, [onRename, title]);

  // A textarea so long titles wrap as the read-only row did; it grows to fit.
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const value = draft ?? title;
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  const edit = (next: string | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = () => {
    const next = draftRef.current?.trim();
    edit(null);
    if (next && next !== titleRef.current) onRenameRef.current(next);
  };

  // A row can unmount with the field focused (the line is deleted, the note
  // closes) and React fires no blur then.
  useEffect(
    () => () => {
      const next = draftRef.current?.trim();
      if (next && next !== titleRef.current) onRenameRef.current(next);
    },
    [],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (onToggleDetails && isToggleKey(e)) {
      e.preventDefault();
      onToggleDetails();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      if (onLeave) onLeave(true);
      else e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      edit(null);
      if (onLeave) onLeave(false);
      else e.currentTarget.blur();
    } else if (e.key === 'Backspace' && onDelete && !e.currentTarget.value) {
      e.preventDefault();
      edit(null);
      onDelete();
    } else if (onMove && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const { selectionStart, selectionEnd, value } = e.currentTarget;
      const collapsed = selectionStart === selectionEnd;
      const dir =
        e.key === 'ArrowUp' ||
        (e.key === 'ArrowLeft' && collapsed && selectionStart === 0)
          ? 'up'
          : e.key === 'ArrowDown' ||
              (e.key === 'ArrowRight' &&
                collapsed &&
                selectionEnd === value.length)
            ? 'down'
            : null;
      if (!dir) return;
      e.preventDefault();
      commit();
      onMove(dir);
    }
  };

  // The wrapper mirrors the text so the field is only as wide as its title.
  return (
    <span className="task-embed__title-wrap" data-value={value}>
      <textarea
        ref={fieldRef}
        rows={1}
        className="task-embed__title task-embed__title-input"
        aria-label="Task title"
        value={value}
        maxLength={NOTEBOOK_TITLE_MAX_LENGTH}
        enterKeyHint="done"
        spellCheck
        onFocus={() => {
          if (draftRef.current === null) edit(title);
        }}
        onChange={(e) => edit(e.target.value.replace(/\s*\n\s*/g, ' '))}
        onBlur={() => {
          if (draftRef.current !== null) commit();
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => e.stopPropagation()}
      />
    </span>
  );
}

export function TaskEmbedRow({
  view,
  onLeave,
  onDelete,
  onMove,
  details,
}: {
  view: TaskEmbedView;
  onLeave?: TaskEmbedLeave;
  onDelete?: TaskEmbedDelete;
  onMove?: TaskEmbedMove;
  details?: TaskEmbedDetails;
}) {
  const panelId = useId();
  const blockRef = useRef<HTMLDivElement>(null);

  if (view.kind === 'loading') {
    return (
      <div className="task-embed task-embed--muted" aria-busy="true">
        <span className="task-embed__box" aria-hidden />
        <span className="task-embed__title">Loading task…</span>
      </div>
    );
  }
  if (view.kind === 'deleted') {
    return (
      <div className="task-embed task-embed--muted">
        <span className="task-embed__box" aria-hidden />
        <span className="task-embed__title">Deleted task</span>
      </div>
    );
  }
  if (view.kind === 'failed') {
    return (
      <div className="task-embed task-embed--failed" role="alert">
        <span className="task-embed__box" aria-hidden />
        <span className="task-embed__title">
          {view.title} · couldn’t save this task
        </span>
        <button
          type="button"
          className="task-embed__retry"
          onClick={view.onRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  const { task, schedule, due, pending, onToggle, onRename, to } = view;
  const done = task.status === 'done';
  const dropped = task.status === 'dropped';
  const priority = PRIORITY_LABEL[task.priority];
  const open = details?.open ?? false;

  const focusTitle = () => {
    const field = blockRef.current?.querySelector('textarea');
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  };

  const row = (
    <div
      className={`task-embed${done ? ' task-embed--done' : ''}${dropped ? ' task-embed--dropped' : ''}`}
      data-task-status={task.status}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // The space after the title opens the details; without them, a press
        // there edits the title, as a full-width field would.
        if (details) {
          e.preventDefault();
          if (!details.open) details.onToggle();
          return;
        }
        const field = e.currentTarget.querySelector('textarea');
        if (!field) return;
        e.preventDefault();
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }}
    >
      <input
        type="checkbox"
        className="task-embed__check"
        checked={done}
        disabled={pending}
        onChange={onToggle}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />
      {onRename && !pending ? (
        <TaskEmbedTitle
          title={task.title}
          onRename={onRename}
          onLeave={onLeave}
          onDelete={onDelete}
          onMove={onMove}
          onToggleDetails={details?.onToggle}
        />
      ) : (
        <span className="task-embed__title">{task.title}</span>
      )}
      {to ? (
        <Link
          to={to}
          className="task-embed__open"
          aria-label={`Open task ${task.title}`}
          title="Open task"
        >
          ↗
        </Link>
      ) : null}
      {details?.hasDescription ? (
        <span
          className="task-embed__has-details"
          role="img"
          aria-label="Has details"
          title="Has details"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3 4.5h10M3 8h10M3 11.5h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
      ) : null}
      {dropped ? <span className="task-embed__pill">Dropped</span> : null}
      {schedule ? (
        <span className="task-embed__pill task-embed__pill--schedule">
          {schedule}
        </span>
      ) : null}
      <TaskDuePill due={due} />
      {priority ? (
        <span className={`task-embed__pill task-embed__pill--${task.priority}`}>
          {priority}
        </span>
      ) : null}
      {details ? (
        <button
          type="button"
          className="task-embed__chevron"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={`Details for ${task.title}`}
          title={open ? 'Collapse details (⌘.)' : 'Expand details (⌘.)'}
          onClick={details.onToggle}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );

  if (!details) return row;
  return (
    <div ref={blockRef} className="task-embed-block">
      {row}
      {!open && details.peek ? (
        <p className="task-embed__peek">{details.peek}</p>
      ) : null}
      {open ? (
        <div
          id={panelId}
          className="task-embed__details"
          role="group"
          aria-label={`Details for ${task.title}`}
          onKeyDown={(e) => {
            if (e.defaultPrevented) return;
            if (e.key === 'Escape' || isToggleKey(e)) {
              e.preventDefault();
              focusTitle();
              details.onToggle();
            }
          }}
        >
          {details.panel}
        </div>
      ) : null}
    </div>
  );
}
