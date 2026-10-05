import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '@gagnechris/shared';

type RowTask = Pick<Task, 'title' | 'priority' | 'status'>;

export function TaskCheckbox({
  task,
  onToggle,
  disabled,
}: {
  task: Pick<Task, 'title' | 'status'>;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const done = task.status === 'done';
  return (
    <input
      type="checkbox"
      checked={done}
      disabled={disabled}
      onChange={onToggle}
      aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
    />
  );
}

type TaskRowProps = {
  task: RowTask;
  onToggle: () => void;
  meta: ReactNode;
  /** Without a route the title is plain text. */
  to?: string;
  /** `list` strikes through done and dropped tasks and labels in-progress and dropped ones; `today` is the compact panel row. */
  variant: 'list' | 'today';
};

const titleLinkStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  textDecoration: 'none',
  color: 'inherit',
};

export function TaskRow({ task, onToggle, meta, to, variant }: TaskRowProps) {
  const list = variant === 'list';
  const closed = task.status === 'done' || task.status === 'dropped';
  const body = (
    <>
      <span
        className="admin-post-list__title"
        style={
          list && closed
            ? { textDecoration: 'line-through', opacity: 0.7 }
            : undefined
        }
      >
        {task.title}
        <span className="admin-badge">{task.priority}</span>
        {list && task.status === 'in_progress' ? (
          <span className="admin-badge admin-badge--published">
            in progress
          </span>
        ) : null}
        {list && task.status === 'dropped' ? (
          <span className="admin-badge">dropped</span>
        ) : null}
      </span>
      <span className="admin-post-list__meta">{meta}</span>
    </>
  );
  return (
    <li className="admin-post-list__item">
      <div
        className="admin-post-list__link"
        style={{
          display: 'flex',
          gap: list ? '0.75rem' : '0.5rem',
          alignItems: 'flex-start',
        }}
      >
        <TaskCheckbox task={task} onToggle={onToggle} />
        {to ? (
          <Link to={to} style={titleLinkStyle}>
            {body}
          </Link>
        ) : (
          <span style={titleLinkStyle}>{body}</span>
        )}
      </div>
    </li>
  );
}
