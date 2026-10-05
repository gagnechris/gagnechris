import { useId } from 'react';
import { Link } from 'react-router-dom';
import {
  formatTaskDay,
  nextWeekday,
  type Task,
  type TaskSchedule,
} from '@gagnechris/shared';
import { parseLocalDate } from '../calendarDates';
import { SnoozeMenu } from './SnoozeMenu';
import { TaskCheckbox } from './TaskRow';
import {
  comingUpDayLabel,
  type ComingUpDay,
  type StillOpenSource,
} from './todayTaskBuckets';
import './todayPanels.css';

type PanelTask = Pick<Task, 'id' | 'title' | 'status' | 'priority'>;

export type StillOpenRow = {
  task: PanelTask;
  source: StillOpenSource;
  /** Route for the source chip (the home note, else the task). */
  sourceTo?: string;
  /** Route for the title. */
  to?: string;
};

type StillOpenProps = {
  rows: StillOpenRow[];
  /** Day Snooze and its menu count from. */
  snoozeFrom: string;
  onToggle: (id: string) => void;
  onSnooze: (id: string, schedule: TaskSchedule) => void;
  onDrop: (id: string) => void;
  /** Rows without checkbox, Snooze or Drop. */
  readOnly?: boolean;
  loading?: boolean;
  error?: string | null;
};

export function StillOpenPanel({
  rows,
  snoozeFrom,
  onToggle,
  onSnooze,
  onDrop,
  readOnly,
  loading,
  error,
}: StillOpenProps) {
  const headingId = useId();
  const monday = nextWeekday(snoozeFrom, 1);
  const mondayLabel = formatTaskDay(monday);
  return (
    <section
      className="today-panel"
      aria-labelledby={headingId}
      data-testid="still-open"
    >
      <header className="today-panel__header">
        <h2 id={headingId}>Still open</h2>
        <span className="today-panel__count">
          {loading ? '' : `${rows.length} open`}
        </span>
      </header>
      <p className="today-panel__lede">
        From earlier notes, plus anything scheduled for today.
      </p>
      {error ? (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="admin-hint">Loading tasks…</p>
      ) : rows.length === 0 ? (
        <p className="admin-hint">Nothing carried over.</p>
      ) : (
        <ul className="today-panel__list">
          {rows.map(({ task, source, sourceTo, to }) => (
            <li
              key={task.id}
              className="today-row"
              data-task-id={task.id}
              data-place="still-open"
            >
              <div className="today-row__main">
                <TaskCheckbox
                  task={task}
                  disabled={readOnly}
                  onToggle={() => onToggle(task.id)}
                />
                {to ? (
                  <Link to={to} className="today-row__title">
                    {task.title}
                  </Link>
                ) : (
                  <span className="today-row__title">{task.title}</span>
                )}
              </div>
              <div className="today-row__meta">
                {sourceTo ? (
                  <Link to={sourceTo} className="today-row__chip">
                    {source.label}
                  </Link>
                ) : (
                  <span className="today-row__chip">{source.label}</span>
                )}
                {readOnly ? null : (
                  <span className="today-row__actions">
                    <button
                      type="button"
                      className="today-row__icon-btn"
                      aria-label={`Snooze ${task.title} to ${mondayLabel}`}
                      title={`Snooze to ${mondayLabel}`}
                      onClick={() =>
                        onSnooze(task.id, { startDate: monday, someday: false })
                      }
                    >
                      <svg
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        aria-hidden="true"
                      >
                        <circle
                          cx="8"
                          cy="9"
                          r="5.25"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <path
                          d="M8 6.5V9l1.75 1.25M2.5 3.5l2-1.5M13.5 3.5l-2-1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    <SnoozeMenu
                      title={task.title}
                      baseDay={snoozeFrom}
                      onChoose={(schedule) => onSnooze(task.id, schedule)}
                    />
                    <button
                      type="button"
                      className="today-row__icon-btn"
                      aria-label={`Drop ${task.title}`}
                      title="Drop: close without doing it"
                      onClick={() => onDrop(task.id)}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 4l8 8M12 4l-8 8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type ComingUpProps<T extends PanelTask> = {
  days: ComingUpDay<T>[];
  /** The page's day: groups are labelled relative to it. */
  day: string;
  onToggle: (id: string) => void;
  taskTo?: (task: T) => string;
  /** The full list of later tasks. */
  upcomingTo: string;
  readOnly?: boolean;
  loading?: boolean;
};

export function ComingUpPanel<T extends PanelTask>({
  days,
  day,
  onToggle,
  taskTo,
  upcomingTo,
  readOnly,
  loading,
}: ComingUpProps<T>) {
  const headingId = useId();
  return (
    <section
      className="today-panel"
      aria-labelledby={headingId}
      data-testid="coming-up"
    >
      <header className="today-panel__header">
        <h2 id={headingId}>Coming up</h2>
        <Link to={upcomingTo} className="today-panel__link">
          Upcoming
        </Link>
      </header>
      {loading ? (
        <p className="admin-hint">Loading tasks…</p>
      ) : days.length === 0 ? (
        <p className="admin-hint">Nothing in the next two weeks.</p>
      ) : (
        days.map(({ date, tasks }) => (
          <div key={date} className="today-panel__day">
            <h3>{comingUpDayLabel(date, day)}</h3>
            <ul className="today-panel__list">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="today-row today-row--compact"
                  data-task-id={task.id}
                  data-place="coming-up"
                >
                  <div className="today-row__main">
                    <TaskCheckbox
                      task={task}
                      disabled={readOnly}
                      onToggle={() => onToggle(task.id)}
                    />
                    {taskTo ? (
                      <Link to={taskTo(task)} className="today-row__title">
                        {task.title}
                      </Link>
                    ) : (
                      <span className="today-row__title">{task.title}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

export function CarryFooter({
  count,
  nextDay,
}: {
  count: number;
  nextDay: string;
}) {
  const weekday =
    parseLocalDate(nextDay)?.toLocaleDateString('en-US', {
      weekday: 'long',
    }) ?? nextDay;
  return (
    <p className="today-carry" data-testid="carry-footer">
      <span aria-hidden="true">→ </span>
      {count === 1 ? '1 open task' : `${count} open tasks`} will carry to{' '}
      {weekday} if not done
    </p>
  );
}
