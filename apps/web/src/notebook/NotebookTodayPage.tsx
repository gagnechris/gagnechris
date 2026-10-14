import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  useDailyNoteDatesQuery,
  type NotebookArea,
  type Task,
} from '@gagnechris/app-core';
import { addDays, isCalendarDay, snoozeBaseDay } from '@gagnechris/shared';
import type { NotebookOutletContext } from './NotebookLayout';
import { monthBounds } from '../kit/calendarDates';
import { NotebookCalendar } from './NotebookCalendar';
import {
  CarryFooter,
  ComingUpPanel,
  StillOpenPanel,
} from '../kit/tasks/TodayPanels';
import { TodaySheet } from '../kit/tasks/TodaySheet';
import ShellIcon from '../workspace/ui/ShellIcon';
import { SidebarToggle } from '../workspace/ui/SidebarToggle';
import { useOpenWorkspaceSearch } from '../workspace/workspaceSearch';
import {
  NOTEBOOK_AREA_FILTERS,
  NOTEBOOK_AREA_LABELS,
  type NotebookAreaFilter,
} from './notebookAreaPreference';
import { TaskSyntaxCheatSheet } from '../kit/tasks/TaskSyntaxCheatSheet';
import { DayTitle, TodayEditor } from './TodayEditor';
import { useLocalToday } from './useLocalToday';
import { useTodayActions } from './useTodayActions';
import { TaskParentsProvider } from './TaskParentsProvider';
import { useTodayTasks } from './useTodayTasks';
import { ResizeHandle } from '../workspace/ui/ResizeHandle';
import { TodaySideRail } from './TodaySideRail';
import { useStoredWidth } from '../workspace/ui/useStoredWidth';
import { readTodaySideOpen, writeTodaySideOpen } from './todaySidePreference';

function resolveDate(param: string | null, today: string): string {
  if (param && isCalendarDay(param)) return param;
  return today;
}

export default function NotebookTodayPage() {
  const { areaFilter, setAreaFilter } =
    useOutletContext<NotebookOutletContext>();
  const openSearch = useOpenWorkspaceSearch();
  const stripRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDetailsElement>(null);
  const appendEmbedRef = useRef<((taskId: string) => void) | null>(null);
  const [noteReady, setNoteReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const sideRef = useRef<HTMLElement>(null);
  const sideToggleRef = useRef<HTMLButtonElement>(null);
  const [sideWidth, setSideWidth] = useStoredWidth(
    'gagnechris.notebook.todaySideWidth',
    SIDE_MIN,
    SIDE_MAX,
  );
  const [sideOpen, setSideOpen] = useState(readTodaySideOpen);
  const setSide = (open: boolean) => {
    writeTodaySideOpen(open);
    setSideOpen(open);
  };
  const toggleSide = () => setSide(!sideOpen);
  const clearHighlight = useCallback(() => setHighlightTaskId(null), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const editorRef = useRef<HTMLDivElement>(null);
  const unsavedRef = useRef(false);
  const onUnsavedChange = useCallback((unsaved: boolean) => {
    unsavedRef.current = unsaved;
  }, []);
  // Midnight must not swap the day under someone mid-sentence: hold the
  // previous day until they navigate.
  const [heldDay, setHeldDay] = useState<string | null>(null);
  const followsTodayRef = useRef(true);
  const today = useLocalToday(
    useCallback((previous: string) => {
      if (!followsTodayRef.current) return;
      const focused = editorRef.current?.contains(document.activeElement);
      if (unsavedRef.current || focused) setHeldDay(previous);
    }, []),
  );
  const dateParam = searchParams.get('date');
  const followsToday = !(dateParam && isCalendarDay(dateParam));
  useEffect(() => {
    followsTodayRef.current = followsToday && heldDay === null;
  }, [followsToday, heldDay]);
  const date = resolveDate(dateParam, heldDay ?? today);
  // The calendar can show another month than the day's; mark that one.
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null);
  const { from, to } = useMemo(
    () => monthBounds(calendarMonth ?? date),
    [calendarMonth, date],
  );

  const writingArea: NotebookArea | null =
    areaFilter === 'all' ? null : areaFilter;

  const datesQuery = useDailyNoteDatesQuery(
    writingArea ?? undefined,
    from,
    to,
    writingArea !== null,
  );

  const noteKey = writingArea ? `${writingArea}:${date}` : null;
  const [embedded, setEmbedded] = useState<{
    key: string;
    ids: ReadonlySet<string> | null;
  } | null>(null);
  const onEmbeddedIds = useCallback(
    (ids: ReadonlySet<string> | null) => {
      if (noteKey) setEmbedded({ key: noteKey, ids });
    },
    [noteKey],
  );
  // With no note on the page (All), nothing is embedded.
  const embeddedIds: ReadonlySet<string> | null = noteKey
    ? embedded?.key === noteKey
      ? embedded.ids
      : null
    : NO_IDS;

  const { buckets, stillOpenRows, loading, loadError } = useTodayTasks({
    area: writingArea ?? undefined,
    day: date,
    embeddedIds,
  });
  const {
    onToggle,
    onSnooze,
    onDrop,
    error: actionError,
  } = useTodayActions(buckets);
  const readOnly = writingArea === null;
  const comingUpCount = buckets.comingUp.reduce(
    (n, d) => n + d.tasks.length,
    0,
  );
  const listed = useMemo(
    () => [
      ...stillOpenRows.map((r) => r.task),
      ...buckets.comingUp.flatMap((d) => d.tasks),
    ],
    [stillOpenRows, buckets.comingUp],
  );
  const tasksLoading = loading.stillOpen || loading.comingUp;
  const tasksError = loadError ? 'Could not load tasks.' : actionError;

  const closeSheet = () => {
    setSheetOpen(false);
    stripRef.current?.focus();
  };
  // The editor takes focus on the new line, so context can be typed at once.
  const addToNote = (taskId: string) => {
    appendEmbedRef.current?.(taskId);
    setSheetOpen(false);
    setHighlightTaskId(taskId);
  };
  const canAddToNote = noteReady && date === today;

  // Push (not replace) so Back steps through the days visited.
  // Leaving a day unmounts its editor, which flushes unsaved text.
  const setDate = (next: string) => {
    if (next === date) return;
    setHeldDay(null);
    setSearchParams((params) => {
      if (next === today) params.delete('date');
      else params.set('date', next);
      return params;
    });
  };

  return (
    <TaskParentsProvider tasks={listed}>
      <section className="workspace-panel workspace-panel--editor">
        <div
          className={`notebook-today${sideOpen ? '' : ' notebook-today--side-closed'}`}
          style={
            sideWidth === null
              ? undefined
              : ({ '--today-side-width': `${sideWidth}px` } as CSSProperties)
          }
        >
          <div className="notebook-today__main" ref={editorRef}>
            <div className="notebook-today__day-nav">
              <SidebarToggle />
              <button
                type="button"
                className="kit-btn"
                aria-label="Previous"
                title="Previous day"
                onClick={() => setDate(addDays(date, -1))}
              >
                ‹
              </button>
              <button
                type="button"
                className="kit-btn"
                aria-label="Jump to today"
                disabled={date === today}
                onClick={() => setDate(today)}
              >
                Today
              </button>
              <button
                type="button"
                className="kit-btn"
                aria-label="Next"
                title="Next day"
                onClick={() => setDate(addDays(date, 1))}
              >
                ›
              </button>
              <details ref={calendarRef} className="notebook-today__calendar">
                <summary>
                  <svg
                    className="notebook-today__calendar-icon"
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM16 2v4M8 2v4M3 10h18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="notebook-today__calendar-label">
                    Calendar
                  </span>
                </summary>
                <NotebookCalendar
                  selected={date}
                  onSelect={(next) => {
                    setDate(next);
                    // The open calendar covers the note.
                    const calendar = calendarRef.current;
                    if (!calendar) return;
                    calendar.open = false;
                    calendar.querySelector('summary')?.focus();
                  }}
                  markedDates={datesQuery.data}
                  onMonthChange={setCalendarMonth}
                />
              </details>
              <button
                type="button"
                ref={sideToggleRef}
                className="kit-btn notebook-today__side-toggle"
                aria-controls="notebook-today-side"
                aria-expanded={sideOpen}
                title={sideOpen ? 'Hide the task panel' : 'Show the task panel'}
                onClick={toggleSide}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  aria-hidden="true"
                >
                  <path
                    d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM15 4v16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {sideOpen ? 'Hide tasks' : 'Show tasks'}
              </button>
              <span className="notebook-today__phone-tools">
                <select
                  className="kit-input notebook-today__area"
                  aria-label="Notebook area"
                  value={areaFilter}
                  onChange={(e) =>
                    setAreaFilter(e.target.value as NotebookAreaFilter)
                  }
                >
                  {NOTEBOOK_AREA_FILTERS.map((area) => (
                    <option key={area} value={area}>
                      {NOTEBOOK_AREA_LABELS[area]}
                    </option>
                  ))}
                </select>
                {openSearch ? (
                  <button
                    type="button"
                    className="kit-btn notebook-today__search"
                    aria-label="Search"
                    onClick={openSearch}
                  >
                    <ShellIcon name="search" />
                  </button>
                ) : null}
              </span>
            </div>
            <button
              ref={stripRef}
              type="button"
              className="notebook-today__strip"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-label={
                tasksLoading
                  ? 'Today’s tasks. Show list'
                  : `${stillOpenRows.length} still open, ${comingUpCount} coming up. Show list`
              }
              onClick={() => setSheetOpen(true)}
            >
              <span className="notebook-today__strip-text">
                <strong>
                  {tasksLoading ? '…' : stillOpenRows.length} still open
                </strong>{' '}
                · {tasksLoading ? '…' : comingUpCount} coming up
              </span>
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  d="m18 15-6-6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {writingArea ? (
              <TodayEditor
                // A new key after a delete: a fresh editor on the day's placeholder.
                key={`${writingArea}:${date}:${editorGeneration}`}
                area={writingArea}
                date={date}
                today={today}
                onUnsavedChange={onUnsavedChange}
                onEmbeddedIds={onEmbeddedIds}
                appendEmbedRef={appendEmbedRef}
                onNoteReady={setNoteReady}
                highlightTaskId={highlightTaskId}
                onHighlighted={clearHighlight}
                onDeleted={() => setEditorGeneration((n) => n + 1)}
              />
            ) : (
              <>
                <div className="workspace-action-bar notebook-today__header">
                  <DayTitle area={null} date={date} today={today} />
                </div>
                <p className="workspace-panel__lede">
                  Choose Work or Personal in the area switcher to write a daily
                  note or act on tasks. All shows both areas, read-only.
                </p>
              </>
            )}
            {date >= today && !loading.stillOpen ? (
              <CarryFooter
                count={buckets.carryCount}
                nextDay={addDays(date, 1)}
              />
            ) : null}
          </div>
          <aside
            id="notebook-today-side"
            className="notebook-today__side"
            aria-label="Today tasks"
            ref={sideRef}
          >
            <ResizeHandle
              label="Resize task panel"
              className="notebook-today__side-resize"
              target={sideRef}
              width={sideWidth}
              min={SIDE_MIN}
              max={SIDE_MAX}
              edge="left"
              onChange={setSideWidth}
              onCollapse={() => {
                setSide(false);
                sideToggleRef.current?.focus();
              }}
            />
            <StillOpenPanel
              rows={stillOpenRows}
              snoozeFrom={snoozeBaseDay(date, today)}
              readOnly={readOnly}
              loading={loading.stillOpen}
              error={tasksError}
              onToggle={onToggle}
              onSnooze={onSnooze}
              onDrop={onDrop}
              onAddToNote={canAddToNote ? addToNote : undefined}
            />
            <ComingUpPanel
              days={buckets.comingUp}
              day={date}
              readOnly={readOnly}
              loading={loading.comingUp}
              onToggle={onToggle}
              taskTo={taskTo}
              upcomingTo={UPCOMING_ROUTE}
              onAddToNote={canAddToNote ? addToNote : undefined}
            />
            <TaskSyntaxCheatSheet />
          </aside>
          {sideOpen ? null : (
            <TodaySideRail
              controls="notebook-today-side"
              openCount={stillOpenRows.length}
              onOpen={() => setSide(true)}
            />
          )}
        </div>
        {sheetOpen ? (
          <TodaySheet
            stillOpen={stillOpenRows}
            comingUp={buckets.comingUp}
            day={date}
            snoozeFrom={snoozeBaseDay(date, today)}
            readOnly={readOnly}
            loading={tasksLoading}
            error={tasksError}
            onClose={closeSheet}
            onToggle={onToggle}
            onSnooze={onSnooze}
            onDrop={onDrop}
            onAddToNote={canAddToNote ? addToNote : undefined}
            taskTo={taskTo}
          />
        ) : null}
      </section>
    </TaskParentsProvider>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();

const SIDE_MIN = 224;
const SIDE_MAX = 576;

const UPCOMING_ROUTE = '/upcoming';

const taskTo = (task: Pick<Task, 'id'>) => `/tasks/${task.id}`;
