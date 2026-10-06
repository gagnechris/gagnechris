import { Link } from 'react-router-dom';
import type { Task } from '@gagnechris/shared';
import { TaskDuePill } from './TaskDuePill';
import type { TaskDue } from './taskDue';

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
      /** Without a route there is no "open task" link. */
      to?: string;
    };

const PRIORITY_LABEL: Record<Task['priority'], string | null> = {
  high: 'High',
  med: null,
  low: 'Low',
};

export function TaskEmbedRow({ view }: { view: TaskEmbedView }) {
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

  const { task, schedule, due, pending, onToggle, to } = view;
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
      <span className="task-embed__title">{task.title}</span>
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
