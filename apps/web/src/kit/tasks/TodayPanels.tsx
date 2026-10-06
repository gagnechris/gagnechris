import { createElement, useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  formatTaskDay,
  nextWeekday,
  type Task,
  type TaskSchedule,
} from '@gagnechris/shared';
import { parseLocalDate } from '../calendarDates';
import { SnoozeMenu } from './SnoozeMenu';
import { TaskDuePill } from './TaskDuePill';
import type { TaskDue } from './taskDue';
import { TaskCheckbox } from './TaskRow';
import {
  comingUpDayLabel,
  comingUpShortLabel,
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
  due?: TaskDue | null;
};

/** The panel title's level; Coming up's day groups sit one below it. */
export type PanelHeadingLevel = 2 | 3 | 4;

const Heading = ({
  level,
  id,
  className,
  children,
}: {
  level: number;
  id?: string;
  className: string;
  children: ReactNode;
}) => createElement(`h${level}`, { id, className }, children);

type StillOpenProps = {
  rows: StillOpenRow[];
  loading?: boolean;
  error?: string | null;
  headingLevel?: PanelHeadingLevel;
} & (
  | {
      compact?: false;
      /** Day Snooze and its menu count from. */
      snoozeFrom: string;
      onToggle: (id: string) => void;
      onSnooze: (id: string, schedule: TaskSchedule) => void;
      onDrop: (id: string) => void;
      /** Rows without checkbox, Snooze or Drop. */
      readOnly?: boolean;
      /** Without it rows have no "add to the note" button. */
      onAddToNote?: (id: string) => void;
    }
  | {
      /** A short panel: the source under each title and a "+ Note" button. */
      compact: true;
      onAddToNote: (id: string) => void;
    }
);

export function StillOpenPanel(props: StillOpenProps) {
  const { rows, loading, error, headingLevel = 2 } = props;
  const headingId = useId();
  return (
    <section
      className={`today-panel${props.compact ? ' today-panel--compact' : ''}`}
      aria-labelledby={headingId}
      data-testid="still-open"
    >
      <header className="today-panel__header">
        <Heading
          level={headingLevel}
          id={headingId}
          className="today-panel__title"
        >
          Still open
        </Heading>
        <span className="today-panel__count">
          {props.compact
            ? 'from earlier days'
            : loading
              ? ''
              : `${rows.length} open`}
        </span>
      </header>
      {props.compact ? null : (
        <p className="today-panel__lede">
          From earlier notes, plus anything scheduled for today.
        </p>
      )}
      {error ? (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="admin-hint">Loading tasks…</p>
      ) : rows.length === 0 ? (
        <p className="admin-hint">Nothing carried over.</p>
      ) : props.compact ? (
        <ul className="today-panel__list">
          {rows.map(({ task, source, due }) => (
            <li
              key={task.id}
              className="today-row"
              data-task-id={task.id}
              data-place="still-open"
            >
              <div className="today-row__main">
                <span className="today-row__text">
                  <span className="today-row__title">{task.title}</span>
                  <span className="today-row__source">
                    {due ? (
                      <>
                        <TaskDuePill due={due} />{' '}
                      </>
                    ) : null}
                    {source.label}
                  </span>
                </span>
                <button
                  type="button"
                  className="today-row__add"
                  aria-label={`Add ${task.title} to the note`}
                  onClick={() => props.onAddToNote(task.id)}
                >
                  + Note
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <FullStillOpenList {...props} />
      )}
    </section>
  );
}

function FullStillOpenList({
  rows,
  snoozeFrom,
  onToggle,
  onSnooze,
  onDrop,
  readOnly,
  onAddToNote,
}: Extract<StillOpenProps, { snoozeFrom: string }>) {
  const monday = nextWeekday(snoozeFrom, 1);
  const mondayLabel = formatTaskDay(monday);
  return (
    <ul className="today-panel__list">
      {rows.map(({ task, source, sourceTo, to, due }) => (
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
            <span className="today-row__badges">
              <TaskDuePill due={due} />
              {sourceTo ? (
                <Link to={sourceTo} className="today-row__chip">
                  {source.label}
                </Link>
              ) : (
                <span className="today-row__chip">{source.label}</span>
              )}
            </span>
            {readOnly ? null : (
              <span className="today-row__actions">
                {onAddToNote ? (
                  <AddToNoteButton task={task} onAdd={onAddToNote} />
                ) : null}
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
  );
}

type ComingUpProps<T extends PanelTask> = {
  days: ComingUpDay<T>[];
  /** The page's day: groups are labelled relative to it. */
  day: string;
  onToggle: (id: string) => void;
  taskTo?: (task: T) => string;
  /** The full list of later tasks; without it there is no link. */
  upcomingTo?: string;
  /** One list with a short day on each row instead of day groups. */
  compact?: boolean;
  /** Without it rows have no "add to the note" button. */
  onAddToNote?: (id: string) => void;
  readOnly?: boolean;
  loading?: boolean;
  headingLevel?: PanelHeadingLevel;
};

export function ComingUpPanel<T extends PanelTask>({
  days,
  day,
  onToggle,
  taskTo,
  upcomingTo,
  compact,
  readOnly,
  loading,
  onAddToNote,
  headingLevel = 2,
}: ComingUpProps<T>) {
  const headingId = useId();
  const row = (task: T, date: string) => (
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
        {compact ? (
          <span className="today-row__day">
            {comingUpShortLabel(date, day)}
          </span>
        ) : null}
        {!readOnly && onAddToNote ? (
          <span className="today-row__actions">
            <AddToNoteButton task={task} onAdd={onAddToNote} />
          </span>
        ) : null}
      </div>
    </li>
  );
  return (
    <section
      className={`today-panel${compact ? ' today-panel--compact' : ''}`}
      aria-labelledby={headingId}
      data-testid="coming-up"
    >
      <header className="today-panel__header">
        <Heading
          level={headingLevel}
          id={headingId}
          className="today-panel__title"
        >
          Coming up
        </Heading>
        {upcomingTo ? (
          <Link to={upcomingTo} className="today-panel__link">
            Upcoming
          </Link>
        ) : null}
      </header>
      {loading ? (
        <p className="admin-hint">Loading tasks…</p>
      ) : days.length === 0 ? (
        <p className="admin-hint">Nothing in the next two weeks.</p>
      ) : compact ? (
        <ul className="today-panel__list">
          {days.flatMap(({ date, tasks }) =>
            tasks.map((task) => row(task, date)),
          )}
        </ul>
      ) : (
        days.map(({ date, tasks }) => (
          <div key={date} className="today-panel__day">
            <Heading
              level={headingLevel + 1}
              className="today-panel__day-label"
            >
              {comingUpDayLabel(date, day)}
            </Heading>
            <ul className="today-panel__list">
              {tasks.map((task) => row(task, date))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

/** Appends this task's embed to today's note, so context goes under it. */
function AddToNoteButton({
  task,
  onAdd,
}: {
  task: PanelTask;
  onAdd: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="today-row__icon-btn"
      aria-label={`Add ${task.title} to today’s note`}
      title="Add to today’s note"
      onClick={() => onAdd(task.id)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M9 1.75H4.25A1.25 1.25 0 0 0 3 3v10a1.25 1.25 0 0 0 1.25 1.25h7.5A1.25 1.25 0 0 0 13 13V5.75L9 1.75ZM9 2v3.5h3.5M8 8v4M6 10h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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
      {count === 0
        ? `Nothing carries over to ${weekday}`
        : `${count === 1 ? '1 open task' : `${count} open tasks`} will carry to ${weekday} if not done`}
    </p>
  );
}
