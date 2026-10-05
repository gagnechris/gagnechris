import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  dailyNoteResource,
  useDailyNoteDatesQuery,
  type NotebookArea,
  type Task,
} from '@gagnechris/app-core';
import { taskEmbedIds } from '@gagnechris/shared';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import type { NotebookOutletContext } from './NotebookLayout';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import {
  addLocalDays,
  monthBounds,
  parseLocalDate,
} from '../kit/calendarDates';
import { NotebookCalendar } from './NotebookCalendar';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from './noteDraft';
import {
  CarryFooter,
  ComingUpPanel,
  StillOpenPanel,
} from '../kit/tasks/TodayPanels';
import { TodaySheet } from '../kit/tasks/TodaySheet';
import ShellIcon from '../workspace/ui/ShellIcon';
import { useOpenWorkspaceSearch } from '../workspace/workspaceSearch';
import {
  NOTEBOOK_AREA_FILTERS,
  NOTEBOOK_AREA_LABELS,
  type NotebookAreaFilter,
} from './notebookAreaPreference';
import { TaskSyntaxCheatSheet } from '../kit/tasks/TaskSyntaxCheatSheet';
import { snoozeBaseDay } from '../kit/tasks/todayTaskBuckets';
import { useLocalToday } from './useLocalToday';
import { useTaskToggle } from './useTaskToggle';
import { useTaskPatch, useTodayTasks } from './useTodayTasks';

function resolveDate(param: string | null, today: string): string {
  if (param && parseLocalDate(param)) return param;
  return today;
}

function dayHeading(date: string, today: string): string {
  const parsed = parseLocalDate(date);
  if (!parsed) return date;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return parsed.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function DayTitle({
  area,
  date,
  today,
}: {
  area: NotebookArea | null;
  date: string;
  today: string;
}) {
  const areaLabel =
    area === 'work'
      ? 'Work notebook'
      : area === 'personal'
        ? 'Personal notebook'
        : 'All areas';
  return (
    <div className="notebook-today__title">
      <p className="notebook-today__kicker">
        {areaLabel}
        {date === today ? ' · Today' : ''}
      </p>
      <h1>{dayHeading(date, today)}</h1>
    </div>
  );
}

function TodayEditor({
  area,
  date,
  today,
  onUnsavedChange,
  onEmbeddedIds,
  appendEmbedRef,
  onNoteReady,
  highlightTaskId,
  onHighlighted,
}: {
  area: NotebookArea;
  date: string;
  today: string;
  onUnsavedChange: (unsaved: boolean) => void;
  /** The draft's embeds, which are what the note shows; null while loading. */
  onEmbeddedIds: (ids: ReadonlySet<string> | null) => void;
  /** Set while the note can take a new embed line. */
  appendEmbedRef: MutableRefObject<((taskId: string) => void) | null>;
  onNoteReady: (ready: boolean) => void;
  highlightTaskId: string | null;
  onHighlighted: () => void;
}) {
  const {
    draft,
    updateDraft,
    entity,
    save,
    saveError,
    loadError,
    isLoading,
    dirty,
    busy,
    saveState,
  } = useWorkspaceDocEditor({
    resource: dailyNoteResource,
    params: { area, date },
    initialDraft: emptyNoteDraft(),
    toDraft: noteDraftFromNote,
    getEntityId: (note) => `${note.area}:${note.date}:${note.id}`,
    toPayload: (current, note) => ({
      id: note.id,
      ...notePayloadFromDraft(current),
    }),
    conflictMessage:
      'Conflict — another device updated this daily note. Reload and try again.',
    conflictMessages: {
      // A placeholder save that lost the race to create this day.
      daily_taken:
        'Another tab or device already started this daily note. Copy what you typed, then reload to open it.',
    },
    loadErrorFallback: 'Could not load daily note.',
  });

  const unsaved = dirty || saveState === 'saving';
  useEffect(() => {
    onUnsavedChange(unsaved);
  }, [onUnsavedChange, unsaved]);

  const ready = !loadError && !isLoading && entity !== undefined;
  const body = draft.bodyMarkdown;
  useEffect(() => {
    onEmbeddedIds(ready ? new Set(taskEmbedIds(body)) : null);
  }, [onEmbeddedIds, ready, body]);

  useEffect(() => {
    if (!ready) return;
    appendEmbedRef.current = (taskId) =>
      updateDraft((prev) => ({
        ...prev,
        bodyMarkdown: appendTaskEmbed(prev.bodyMarkdown, taskId),
      }));
    onNoteReady(true);
    return () => {
      appendEmbedRef.current = null;
      onNoteReady(false);
    };
  }, [appendEmbedRef, onNoteReady, ready, updateDraft]);

  if (loadError || isLoading || !entity) {
    return (
      <>
        <div className="admin-action-bar notebook-today__header">
          <DayTitle area={area} date={date} today={today} />
        </div>
        {loadError ? (
          <p className="admin-panel__error" role="alert">
            {loadError}
          </p>
        ) : (
          <p>Loading daily note…</p>
        )}
      </>
    );
  }

  return (
    <>
      <div className="admin-action-bar notebook-today__header">
        <DayTitle area={area} date={date} today={today} />
        <div className="admin-action-bar__status">
          <SaveIndicator saveState={saveState} dirty={dirty} />
          {entity.version === 0 ? (
            <span className="admin-hint">Not saved yet</span>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            Save
          </button>
        </div>
      </div>
      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}
      <NotebookMarkdownBody
        note={entity}
        ensureNoteSaved={save}
        value={draft.bodyMarkdown}
        onChange={(bodyMarkdown) =>
          updateDraft((prev) => ({ ...prev, bodyMarkdown }))
        }
        highlightTaskId={highlightTaskId}
        onHighlighted={onHighlighted}
      />
    </>
  );
}

/** The embed, then an empty line for the context written under it. */
function appendTaskEmbed(markdown: string, taskId: string): string {
  const body = markdown.replace(/\s+$/, '');
  return `${body}${body ? '\n\n' : ''}{{task:${taskId}}}\n\n`;
}

export default function NotebookTodayPage() {
  const { areaFilter, setAreaFilter } =
    useOutletContext<NotebookOutletContext>();
  const openSearch = useOpenWorkspaceSearch();
  const stripRef = useRef<HTMLButtonElement>(null);
  const appendEmbedRef = useRef<((taskId: string) => void) | null>(null);
  const [noteReady, setNoteReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
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
  const followsToday = !(dateParam && parseLocalDate(dateParam));
  useEffect(() => {
    followsTodayRef.current = followsToday && heldDay === null;
  }, [followsToday, heldDay]);
  const date = resolveDate(dateParam, heldDay ?? today);
  const { from, to } = useMemo(() => monthBounds(date), [date]);

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
  const { toggle, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const tasksById = new Map<string, Task>(
    [...buckets.stillOpen, ...buckets.comingUp.flatMap((d) => d.tasks)].map(
      (t) => [t.id, t],
    ),
  );
  const withTask = (id: string, run: (task: Task) => void) => {
    const task = tasksById.get(id);
    if (task) run(task);
  };
  const readOnly = writingArea === null;
  const comingUpCount = buckets.comingUp.reduce(
    (n, d) => n + d.tasks.length,
    0,
  );
  const tasksLoading = loading.stillOpen || loading.comingUp;
  const tasksError = loadError
    ? 'Could not load tasks.'
    : (patchError ?? toggleError ?? null);

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
    <section className="admin-panel admin-panel--editor">
      <div className="notebook-today">
        <div className="notebook-today__main" ref={editorRef}>
          <div className="notebook-today__day-nav">
            <button
              type="button"
              className="admin-btn"
              aria-label="Previous"
              title="Previous day"
              onClick={() => setDate(addLocalDays(date, -1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="admin-btn"
              aria-label="Jump to today"
              disabled={date === today}
              onClick={() => setDate(today)}
            >
              Today
            </button>
            <button
              type="button"
              className="admin-btn"
              aria-label="Next"
              title="Next day"
              onClick={() => setDate(addLocalDays(date, 1))}
            >
              ›
            </button>
            <details className="notebook-today__calendar">
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
                <span className="notebook-today__calendar-label">Calendar</span>
              </summary>
              <NotebookCalendar
                selected={date}
                onSelect={setDate}
                markedDates={datesQuery.data}
              />
            </details>
            <span className="notebook-today__phone-tools">
              <select
                className="admin-input notebook-today__area"
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
                  className="admin-btn notebook-today__search"
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
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
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
              key={`${writingArea}:${date}`}
              area={writingArea}
              date={date}
              today={today}
              onUnsavedChange={onUnsavedChange}
              onEmbeddedIds={onEmbeddedIds}
              appendEmbedRef={appendEmbedRef}
              onNoteReady={setNoteReady}
              highlightTaskId={highlightTaskId}
              onHighlighted={clearHighlight}
            />
          ) : (
            <>
              <div className="admin-action-bar notebook-today__header">
                <DayTitle area={null} date={date} today={today} />
              </div>
              <p className="admin-panel__lede">
                Choose Work or Personal in the area switcher to write a daily
                note or act on tasks. All shows both areas, read-only.
              </p>
            </>
          )}
          {date >= today && !loading.stillOpen ? (
            <CarryFooter
              count={buckets.carryCount}
              nextDay={addLocalDays(date, 1)}
            />
          ) : null}
        </div>
        <aside className="notebook-today__side" aria-label="Today tasks">
          <StillOpenPanel
            rows={stillOpenRows}
            snoozeFrom={snoozeBaseDay(date, today)}
            readOnly={readOnly}
            loading={loading.stillOpen}
            error={tasksError}
            onToggle={(id) => withTask(id, (task) => void toggle(task))}
            onSnooze={(id, schedule) =>
              withTask(id, (task) => void patch(task, schedule))
            }
            onDrop={(id) =>
              withTask(id, (task) => void patch(task, { status: 'dropped' }))
            }
            onAddToNote={canAddToNote ? addToNote : undefined}
          />
          <ComingUpPanel
            days={buckets.comingUp}
            day={date}
            readOnly={readOnly}
            loading={loading.comingUp}
            onToggle={(id) => withTask(id, (task) => void toggle(task))}
            taskTo={(task) => `/tasks/${task.id}`}
            upcomingTo={UPCOMING_ROUTE}
            onAddToNote={canAddToNote ? addToNote : undefined}
          />
          <TaskSyntaxCheatSheet />
        </aside>
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
          onToggle={(id) => withTask(id, (task) => void toggle(task))}
          onSnooze={(id, schedule) =>
            withTask(id, (task) => void patch(task, schedule))
          }
          onDrop={(id) =>
            withTask(id, (task) => void patch(task, { status: 'dropped' }))
          }
          onAddToNote={canAddToNote ? addToNote : undefined}
          taskTo={(task) => `/tasks/${task.id}`}
        />
      ) : null}
    </section>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();

const UPCOMING_ROUTE = '/upcoming';
