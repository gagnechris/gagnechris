import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '@gagnechris/shared';
import { Checkbox } from '@gagnechris/ui';
import { TaskParentLabel } from './TaskParentLabel';
import { TaskTitleLinks } from './TaskTitleLinks';

type RowTask = Pick<Task, 'title' | 'priority' | 'status'> & {
  parentId?: string | null;
};

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
  const name = done ? `Reopen ${task.title}` : `Complete ${task.title}`;
  return (
    <Checkbox
      shape="round"
      className="task-check"
      label={name}
      hideLabel
      aria-label={name}
      checked={done}
      disabled={disabled}
      onChange={onToggle}
    />
  );
}

type TaskRowProps = {
  task: RowTask;
  onToggle: () => void;
  meta: ReactNode;
  /** Without a route the title is plain text. */
  to?: string;
  /** Buttons after the title, such as Snooze and Drop. */
  actions?: ReactNode;
  /** `list` strikes through done and dropped tasks and labels in-progress and dropped ones; `today` is the compact panel row. */
  variant: 'list' | 'today';
};

const titleLinkStyle: CSSProperties = {
  flex: '1 1 6rem',
  minWidth: 0,
  textDecoration: 'none',
  color: 'inherit',
};

export function TaskRow({
  task,
  onToggle,
  meta,
  to,
  actions,
  variant,
}: TaskRowProps) {
  const list = variant === 'list';
  const closed = task.status === 'done' || task.status === 'dropped';
  const body = (
    <>
      <span
        className="kit-list__title"
        style={
          list && closed
            ? { textDecoration: 'line-through', opacity: 0.7 }
            : undefined
        }
      >
        <TaskParentLabel parentId={task.parentId} />
        {task.title}
        <span className="kit-badge">{task.priority}</span>
        {list && task.status === 'in_progress' ? (
          <span className="kit-badge kit-badge--published">in progress</span>
        ) : null}
        {list && task.status === 'dropped' ? (
          <span className="kit-badge">dropped</span>
        ) : null}
      </span>
      <span className="kit-list__meta">{meta}</span>
    </>
  );
  return (
    <li className="kit-list__item">
      <div
        className="kit-list__link"
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
        <TaskTitleLinks title={task.title} />
        {actions ? <span className="task-row__actions">{actions}</span> : null}
      </div>
    </li>
  );
}
