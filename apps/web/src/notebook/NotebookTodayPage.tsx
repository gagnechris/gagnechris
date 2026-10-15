import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useDailyNoteDatesQuery, type Task } from '@gagnechris/app-core';
import { addDays, isCalendarDay, snoozeBaseDay } from '@gagnechris/shared';
import { Button, IconButton, Select } from '@gagnechris/ui';
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
import { useOpenWorkspaceSearch } from '../workspace/workspaceSearch';
import { TaskSyntaxCheatSheet } from '../kit/tasks/TaskSyntaxCheatSheet';
import { TodayEditor } from './TodayEditor';
import { useLocalToday } from './useLocalToday';
import { useTodayActions } from './useTodayActions';
import { TaskParentsProvider } from './TaskParentsProvider';
import { useTodayTasks } from './useTodayTasks';
import {
  PanelCollapseButton,
  PanelExpandEdge,
} from '../workspace/ui/PanelEdge';
import { ResizeHandle } from '../workspace/ui/ResizeHandle';
import { usePanelEdgeFocus } from '../workspace/ui/usePanelEdgeFocus';
import { useStoredWidth } from '../workspace/ui/useStoredWidth';
import { noteColumnRoom } from '../workspace/ui/noteColumn';
import {
  TODAY_OVERLAY_QUERY,
  readTodaySideOpen,
  writeTodaySideOpen,
} from './todaySidePreference';
import { useMediaQuery } from '../kit/useMediaQuery';

function resolveDate(param: string | null, today: string): string {
  if (param && isCalendarDay(param)) return param;
  return today;
}

export default function NotebookTodayPage() {
  const { area, areaName, areas, setArea } =
    useOutletContext<NotebookOutletContext>();
  const openSearch = useOpenWorkspaceSearch();
  const stripRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDetailsElement>(null);
  const appendEmbedRef = useRef<((taskId: string) => void) | null>(null);
  const [noteReady, setNoteReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const [sideWidth, setSideWidth] = useStoredWidth(
    'gagnechris.notebook.todaySideWidth',
    SIDE_MIN,
    SIDE_MAX,
  );
  const [sideOpen, setSideOpen] = useState(readTodaySideOpen);
  const setSide = useCallback((open: boolean) => {
    writeTodaySideOpen(open);
    setSideOpen(open);
  }, []);
  // Too narrow for the note and the panel side by side: the panel opens over
  // the note, starts closed, and leaves the remembered state alone.
  const overlay = useMediaQuery(TODAY_OVERLAY_QUERY);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [wasOverlay, setWasOverlay] = useState(overlay);
  if (wasOverlay !== overlay) {
    setWasOverlay(overlay);
    setOverlayOpen(false);
  }
  const panelOpen = overlay ? overlayOpen : sideOpen;
  const { collapseRef, expandRef, handOff } = usePanelEdgeFocus(panelOpen);
  const setPanel = useCallback(
    (open: boolean) => (overlay ? setOverlayOpen(open) : setSide(open)),
    [overlay, setSide],
  );
  const closeOverlay = useCallback(
    (focusVisible = true) => {
      handOff(focusVisible);
      setOverlayOpen(false);
    },
    [handOff],
  );
  // The open overlay takes focus itself.
  const togglePanelFromEdge = (byKeyboard: boolean) => {
    if (panelOpen || !overlay) handOff(byKeyboard);
    setPanel(!panelOpen);
  };
  const overlayShown = overlay && overlayOpen;
  useEffect(() => {
    if (!overlayShown) return;
    sideRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayShown, closeOverlay]);
  // The panel opens below the sticky day header so the note's title and
  // menus stay in reach; the header moves until it sticks.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!overlayShown || !grid) return;
    const header = grid.querySelector('.notebook-today__header');
    const place = () => {
      const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
      grid.style.setProperty('--today-overlay-top', `${top}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    if (header) observer.observe(header);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [overlayShown]);
  // Capture phase: CodeMirror binds the same keys to indentSelection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.code !== 'Backslash' ||
        !e.altKey ||
        e.shiftKey ||
        e.metaKey === e.ctrlKey
      ) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      const active = document.activeElement;
      if (
        panelOpen
          ? sideRef.current?.contains(active)
          : active === expandRef.current && !overlay
      ) {
        handOff();
      }
      setPanel(!panelOpen);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setPanel, panelOpen, overlay, expandRef, handOff]);
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

  const datesQuery = useDailyNoteDatesQuery(area, from, to, true);

  const noteKey = `${area}:${date}`;
  const [embedded, setEmbedded] = useState<{
    key: string;
    ids: ReadonlySet<string> | null;
  } | null>(null);
  const onEmbeddedIds = useCallback(
    (ids: ReadonlySet<string> | null) => {
      setEmbedded({ key: noteKey, ids });
    },
    [noteKey],
  );
  const embeddedIds: ReadonlySet<string> | null =
    embedded?.key === noteKey ? embedded.ids : null;

  const { buckets, stillOpenRows, loading, loadError } = useTodayTasks({
    area,
    day: date,
    embeddedIds,
  });
  const {
    onToggle,
    onSnooze,
    onDrop,
    error: actionError,
  } = useTodayActions(buckets);
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
    setOverlayOpen(false);
    setHighlightTaskId(taskId);
  };
  const canAddToNote = noteReady && date === today;
  const carryFooter =
    date >= today && !loading.stillOpen ? (
      <CarryFooter count={buckets.carryCount} nextDay={addDays(date, 1)} />
    ) : null;
  const tasksEdgeProps = {
    label: 'Tasks',
    noun: 'the task panel',
    controls: SIDE_ID,
    side: 'right',
    shortcut: '⌥⌘\\',
    keyShortcuts: 'Alt+Meta+\\ Control+Alt+\\',
    onToggle: togglePanelFromEdge,
  } as const;

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
          ref={gridRef}
          className={`notebook-today${panelOpen ? '' : ' notebook-today--side-closed'}${overlay ? ' notebook-today--overlay' : ''}`}
          style={
            sideWidth === null
              ? undefined
              : ({ '--today-side-width': `${sideWidth}px` } as CSSProperties)
          }
        >
          <div className="notebook-today__main notebook-column" ref={editorRef}>
            <div className="notebook-today__day-nav">
              <IconButton
                variant="outline"
                label="Previous"
                title="Previous day"
                onClick={() => setDate(addDays(date, -1))}
              >
                <ShellIcon name="chevronLeft" />
              </IconButton>
              <Button
                aria-label="Jump to today"
                disabled={date === today}
                onClick={() => setDate(today)}
              >
                Today
              </Button>
              <IconButton
                variant="outline"
                label="Next"
                title="Next day"
                onClick={() => setDate(addDays(date, 1))}
              >
                <ShellIcon name="chevronRight" />
              </IconButton>
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
              <span className="notebook-today__phone-tools">
                <Select
                  className="notebook-today__area"
                  aria-label="Notebook area"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                >
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                {openSearch ? (
                  <IconButton
                    variant="outline"
                    label="Search"
                    className="notebook-today__search"
                    onClick={openSearch}
                  >
                    <ShellIcon name="search" />
                  </IconButton>
                ) : null}
              </span>
            </div>
            {/* eslint-disable-next-line no-restricted-syntax -- the Today strip is a whole-row disclosure, not a button primitive */}
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
            <TodayEditor
              // A new key after a delete: a fresh editor on the day's placeholder.
              key={`${area}:${date}:${editorGeneration}`}
              area={area}
              areaName={areaName}
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
          </div>
          <aside
            id={SIDE_ID}
            className="notebook-today__side"
            aria-label="Today tasks"
            ref={sideRef}
            tabIndex={overlay ? -1 : undefined}
          >
            {overlay ? null : (
              <ResizeHandle
                label="Resize task panel"
                className="notebook-today__side-resize"
                target={sideRef}
                width={sideWidth}
                min={SIDE_MIN}
                max={SIDE_MAX}
                edge="left"
                onChange={setSideWidth}
                room={noteColumnRoom}
                onCollapse={() => {
                  handOff(false);
                  setSide(false);
                }}
              />
            )}
            {panelOpen ? (
              <PanelCollapseButton
                {...tasksEdgeProps}
                ref={collapseRef}
                className="notebook-today__side-edge"
              />
            ) : null}
            <StillOpenPanel
              rows={stillOpenRows}
              snoozeFrom={snoozeBaseDay(date, today)}
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
              loading={loading.comingUp}
              onToggle={onToggle}
              taskTo={taskTo}
              upcomingTo={UPCOMING_ROUTE}
              onAddToNote={canAddToNote ? addToNote : undefined}
            />
            <TaskSyntaxCheatSheet />
            {carryFooter}
          </aside>
          {overlayShown ? (
            <div
              className="notebook-today__scrim"
              aria-hidden="true"
              onClick={() => closeOverlay(false)}
            />
          ) : null}
        </div>
        {panelOpen ? null : (
          <PanelExpandEdge
            {...tasksEdgeProps}
            ref={expandRef}
            className="notebook-today__side-expand"
            count={loading.stillOpen ? null : stillOpenRows.length}
            countLabel="still open"
          />
        )}
        {sheetOpen ? (
          <TodaySheet
            stillOpen={stillOpenRows}
            comingUp={buckets.comingUp}
            day={date}
            snoozeFrom={snoozeBaseDay(date, today)}
            loading={tasksLoading}
            error={tasksError}
            onClose={closeSheet}
            onToggle={onToggle}
            onSnooze={onSnooze}
            onDrop={onDrop}
            onAddToNote={canAddToNote ? addToNote : undefined}
            taskTo={taskTo}
            footer={carryFooter}
          />
        ) : null}
      </section>
    </TaskParentsProvider>
  );
}

const SIDE_ID = 'notebook-today-side';
const SIDE_MIN = 224;
const SIDE_MAX = 576;

const UPCOMING_ROUTE = '/upcoming';

const taskTo = (task: Pick<Task, 'id'>) => `/tasks/${task.id}`;
