import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useVersionedDocEditor } from '../workspace/useVersionedDocEditor';
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
}: {
  area: NotebookArea;
  date: string;
  today: string;
  onUnsavedChange: (unsaved: boolean) => void;
  /** The draft's embeds, which are what the note shows; null while loading. */
  onEmbeddedIds: (ids: ReadonlySet<string> | null) => void;
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
  } = useVersionedDocEditor({
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
      />
    </>
  );
}

export default function NotebookTodayPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
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

  // Push (not replace) so Back steps through the days visited.
  // Leaving a day unmounts its editor, which flushes unsaved text.
  const setDate = (next: string) => {
    if (next === date) return;
    setHeldDay(null);
    setSearchParams(next === today ? {} : { date: next });
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
              <summary>Calendar</summary>
              <NotebookCalendar
                selected={date}
                onSelect={setDate}
                markedDates={datesQuery.data}
              />
            </details>
          </div>
          {writingArea ? (
            <TodayEditor
              key={`${writingArea}:${date}`}
              area={writingArea}
              date={date}
              today={today}
              onUnsavedChange={onUnsavedChange}
              onEmbeddedIds={onEmbeddedIds}
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
            error={
              loadError
                ? 'Could not load tasks.'
                : (patchError ?? toggleError ?? null)
            }
            onToggle={(id) => withTask(id, (task) => void toggle(task))}
            onSnooze={(id, schedule) =>
              withTask(id, (task) => void patch(task, schedule))
            }
            onDrop={(id) =>
              withTask(id, (task) => void patch(task, { status: 'dropped' }))
            }
          />
          <ComingUpPanel
            days={buckets.comingUp}
            day={date}
            readOnly={readOnly}
            loading={loading.comingUp}
            onToggle={(id) => withTask(id, (task) => void toggle(task))}
            taskTo={(task) => `/tasks/${task.id}`}
            upcomingTo={UPCOMING_ROUTE}
          />
          <TaskSyntaxCheatSheet />
        </aside>
      </div>
    </section>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();

const UPCOMING_ROUTE = '/upcoming';
