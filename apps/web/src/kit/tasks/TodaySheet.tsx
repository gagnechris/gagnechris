import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  formatTaskDay,
  nextWeekday,
  type Task,
  type TaskSchedule,
} from '@gagnechris/shared';
import { useModalDialog } from '../useModalDialog';
import { useTabs } from '../useTabs';
import type { StillOpenRow } from './TodayPanels';
import { TaskDuePill } from './TaskDuePill';
import { TaskCheckbox } from './TaskRow';
import { comingUpDayLabel, type ComingUpDay } from './todayTaskBuckets';
import './todayPanels.css';

type SheetTask = Pick<Task, 'id' | 'title' | 'status' | 'priority'>;
export type TodaySheetTab = 'open' | 'coming';
const TABS: readonly TodaySheetTab[] = ['open', 'coming'];

type Props<T extends SheetTask> = {
  stillOpen: StillOpenRow[];
  comingUp: ComingUpDay<T>[];
  /** The page's day: Coming up rows are labelled relative to it. */
  day: string;
  /** Day Snooze counts from. */
  snoozeFrom: string;
  onClose: () => void;
  onToggle: (id: string) => void;
  onSnooze: (id: string, schedule: TaskSchedule) => void;
  onDrop: (id: string) => void;
  /** Without it rows have no "+ Note" pill. */
  onAddToNote?: (id: string) => void;
  taskTo?: (task: T) => string;
  /** Rows without checkbox, Snooze or Drop. */
  readOnly?: boolean;
  loading?: boolean;
  error?: string | null;
};

/** How far a row or the sheet must travel before a swipe counts. */
const SWIPE_PX = 48;
const DISMISS_PX = 80;

/** Still open and Coming up as a phone bottom sheet. */
export function TodaySheet<T extends SheetTask>({
  stillOpen,
  comingUp,
  day,
  snoozeFrom,
  onClose,
  onToggle,
  onSnooze,
  onDrop,
  onAddToNote,
  taskTo,
  readOnly,
  loading,
  error,
}: Props<T>) {
  const [tab, setTab] = useState<TodaySheetTab>('open');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const tabs = useTabs<TodaySheetTab>({
    keys: TABS,
    selected: tab,
    onSelect: (next) => {
      setTab(next);
      setRevealed(null);
    },
    label: 'Task lists',
  });
  const { dialogProps } = useModalDialog<HTMLElement>({
    label: 'Today’s tasks',
    onClose,
  });

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const comingCount = comingUp.reduce((n, d) => n + d.tasks.length, 0);
  const monday = nextWeekday(snoozeFrom, 1);
  const mondayLabel = formatTaskDay(monday);

  const grab = {
    onPointerDown: (e: PointerEvent) => {
      dragFrom.current = e.clientY;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragFrom.current === null) return;
      setDragY(Math.max(0, e.clientY - dragFrom.current));
    },
    onPointerUp: () => {
      const pulled = dragY;
      dragFrom.current = null;
      setDragY(0);
      if (pulled > DISMISS_PX) onClose();
    },
    onPointerCancel: () => {
      dragFrom.current = null;
      setDragY(0);
    },
  };

  const tabButton = (key: TodaySheetTab, label: string, count: number) => (
    <button {...tabs.tabProps(key)} className="today-sheet__tab">
      {label} · {loading ? '…' : count}
    </button>
  );

  const addPill = (task: SheetTask) =>
    onAddToNote ? (
      <button
        type="button"
        className="today-sheet__pill"
        aria-label={`Add ${task.title} to today’s note`}
        onClick={() => onAddToNote(task.id)}
      >
        + Note
      </button>
    ) : null;

  const body = loading ? (
    <p className="admin-hint">Loading tasks…</p>
  ) : tab === 'open' ? (
    stillOpen.length === 0 ? (
      <p className="admin-hint">Nothing carried over.</p>
    ) : (
      <ul className="today-sheet__list">
        {stillOpen.map((row) => (
          <StillOpenSheetRow
            key={row.task.id}
            row={row}
            revealed={revealed === row.task.id}
            onReveal={(on) => setRevealed(on ? row.task.id : null)}
            readOnly={readOnly}
            mondayLabel={mondayLabel}
            onToggle={() => onToggle(row.task.id)}
            onSnooze={() =>
              onSnooze(row.task.id, {
                startDate: monday,
                someday: false,
              })
            }
            onDrop={() => onDrop(row.task.id)}
            addPill={addPill(row.task)}
          />
        ))}
      </ul>
    )
  ) : comingCount === 0 ? (
    <p className="admin-hint">Nothing in the next two weeks.</p>
  ) : (
    <ul className="today-sheet__list">
      {comingUp.flatMap(({ date, tasks }) =>
        tasks.map((task) => (
          <li key={task.id} className="today-sheet__row" data-task-id={task.id}>
            <div className="today-sheet__row-main">
              <span className="today-sheet__text">
                {taskTo ? (
                  <Link to={taskTo(task)} className="today-sheet__title">
                    {task.title}
                  </Link>
                ) : (
                  <span className="today-sheet__title">{task.title}</span>
                )}
                <span className="today-sheet__meta today-sheet__meta--day">
                  {comingUpDayLabel(date, day)}
                </span>
              </span>
              {addPill(task)}
            </div>
          </li>
        )),
      )}
    </ul>
  );

  return createPortal(
    <div className="today-sheet">
      <div className="today-sheet__scrim" onClick={onClose} />
      <section
        {...dialogProps}
        className="today-sheet__panel"
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div className="today-sheet__grab" {...grab}>
          <span className="today-sheet__handle" aria-hidden="true" />
        </div>
        <div className="today-sheet__head">
          <div {...tabs.listProps} className="today-sheet__tabs">
            {tabButton('open', 'Still open', stillOpen.length)}
            {tabButton('coming', 'Coming up', comingCount)}
          </div>
          <button
            type="button"
            className="today-sheet__close"
            aria-label="Close"
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <p className="today-sheet__hint">
          {tab === 'open'
            ? readOnly
              ? 'From earlier notes and scheduled for today.'
              : 'From earlier notes and scheduled for today. Swipe left or tap ⋯ to snooze or drop.'
            : onAddToNote
              ? 'Add one to today’s note to write context under it.'
              : 'Starting in the next two weeks.'}
        </p>
        {error ? (
          <p className="admin-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        {TABS.map((key) => (
          <div
            key={key}
            {...tabs.panelProps(key)}
            className="today-sheet__body"
          >
            {key === tab ? body : null}
          </div>
        ))}
      </section>
    </div>,
    document.body,
  );
}

function StillOpenSheetRow({
  row: { task, source, to, due },
  revealed,
  onReveal,
  readOnly,
  mondayLabel,
  onToggle,
  onSnooze,
  onDrop,
  addPill,
}: {
  row: StillOpenRow;
  revealed: boolean;
  onReveal: (on: boolean) => void;
  readOnly?: boolean;
  mondayLabel: string;
  onToggle: () => void;
  onSnooze: () => void;
  onDrop: () => void;
  addPill: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const focusActions = useRef(false);

  useEffect(() => {
    if (revealed && focusActions.current) {
      actionsRef.current?.querySelector('button')?.focus();
    }
    focusActions.current = false;
  }, [revealed]);

  const swipe = readOnly
    ? {}
    : {
        onPointerDown: (e: PointerEvent) => {
          start.current = { x: e.clientX, y: e.clientY };
          swiped.current = false;
        },
        onPointerUp: (e: PointerEvent) => {
          if (!start.current) return;
          const dx = e.clientX - start.current.x;
          const dy = e.clientY - start.current.y;
          start.current = null;
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
          swiped.current = true;
          onReveal(dx < 0);
        },
        onPointerCancel: () => {
          start.current = null;
        },
        // A swipe ends over a link or button; don't let it also tap it.
        onClickCapture: (e: MouseEvent) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          } else if (revealed) {
            e.preventDefault();
            e.stopPropagation();
            onReveal(false);
          }
        },
      };

  return (
    <li
      className={`today-sheet__row${revealed ? ' today-sheet__row--revealed' : ''}`}
      data-task-id={task.id}
    >
      {readOnly ? null : (
        <div
          ref={actionsRef}
          className="today-sheet__actions"
          hidden={!revealed}
        >
          <button
            type="button"
            className="today-sheet__action"
            aria-label={`Snooze ${task.title} to ${mondayLabel}`}
            onClick={onSnooze}
          >
            Snooze
            <span className="today-sheet__action-sub">{mondayLabel}</span>
          </button>
          <button
            type="button"
            className="today-sheet__action today-sheet__action--drop"
            aria-label={`Drop ${task.title}`}
            onClick={onDrop}
          >
            Drop
          </button>
        </div>
      )}
      <div className="today-sheet__row-main" {...swipe}>
        {readOnly ? null : <TaskCheckbox task={task} onToggle={onToggle} />}
        <span className="today-sheet__text">
          {to ? (
            <Link to={to} className="today-sheet__title">
              {task.title}
            </Link>
          ) : (
            <span className="today-sheet__title">{task.title}</span>
          )}
          <span className="today-sheet__meta">
            {due ? (
              <>
                <TaskDuePill due={due} />{' '}
              </>
            ) : null}
            {source.label}
          </span>
        </span>
        {addPill}
        {readOnly ? null : (
          <button
            type="button"
            className="today-sheet__more"
            aria-label={`More actions for ${task.title}`}
            aria-expanded={revealed}
            onClick={() => {
              focusActions.current = !revealed;
              onReveal(!revealed);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="19" cy="12" r="1.8" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}
