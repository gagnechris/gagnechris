import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
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

const PRIORITY_LABEL: Record<Task['priority'], string | null> = {
  high: 'High',
  med: null,
  low: 'Low',
};

function TaskEmbedTitle({
  title,
  onRename,
  onLeave,
}: {
  title: string;
  onRename: (title: string) => void;
  onLeave?: TaskEmbedLeave;
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
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      if (onLeave) onLeave(true);
      else e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      edit(null);
      if (onLeave) onLeave(false);
      else e.currentTarget.blur();
    }
  };

  return (
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
  );
}

export function TaskEmbedRow({
  view,
  onLeave,
}: {
  view: TaskEmbedView;
  onLeave?: TaskEmbedLeave;
}) {
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
  return (
    <div
      className={`task-embed${done ? ' task-embed--done' : ''}${dropped ? ' task-embed--dropped' : ''}`}
      data-task-status={task.status}
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
        />
      ) : (
        <span className="task-embed__title">{task.title}</span>
      )}
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
    </div>
  );
}
