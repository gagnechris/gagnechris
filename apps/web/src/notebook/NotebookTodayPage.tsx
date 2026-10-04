import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  dailyNoteResource,
  useDailyNoteDatesQuery,
  type NotebookArea,
} from '@gagnechris/app-core';
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
import TodayTasksPanel from './TodayTasksPanel';
import { useLocalToday } from './useLocalToday';

function resolveDate(param: string | null, today: string): string {
  if (param && parseLocalDate(param)) return param;
  return today;
}

function dayHeading(date: string, today: string): string {
  if (date === today) return 'Today';
  const parsed = parseLocalDate(date);
  return parsed
    ? parsed.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : date;
}

function TodayEditor({
  area,
  date,
  today,
  onUnsavedChange,
}: {
  area: NotebookArea;
  date: string;
  today: string;
  onUnsavedChange: (unsaved: boolean) => void;
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

  if (loadError) {
    return (
      <p className="admin-panel__error" role="alert">
        {loadError}
      </p>
    );
  }

  if (isLoading || !entity) {
    return <p>Loading daily note…</p>;
  }

  return (
    <>
      <div className="admin-action-bar">
        <div className="admin-action-bar__status">
          <h1>{dayHeading(date, today)}</h1>
          <SaveIndicator saveState={saveState} dirty={dirty} />
        </div>
        <div className="admin-toolbar" style={{ marginBottom: 0 }}>
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
      <p className="admin-panel__lede">
        {area === 'work' ? 'Work' : 'Personal'} · {date}
        {entity.version === 0 ? ' · not saved yet' : ''}
      </p>
      <NotebookMarkdownBody
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
        <aside className="notebook-today__sidebar">
          <div className="notebook-today__day-nav">
            <button
              type="button"
              className="admin-btn"
              onClick={() => setDate(addLocalDays(date, -1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setDate(today)}
            >
              Jump to today
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setDate(addLocalDays(date, 1))}
            >
              Next
            </button>
          </div>
          <NotebookCalendar
            selected={date}
            onSelect={setDate}
            markedDates={datesQuery.data}
          />
        </aside>
        <div className="notebook-today__editor" ref={editorRef}>
          {writingArea ? (
            <TodayEditor
              key={`${writingArea}:${date}`}
              area={writingArea}
              date={date}
              today={today}
              onUnsavedChange={onUnsavedChange}
            />
          ) : (
            <>
              <h1>{dayHeading(date, today)}</h1>
              <p className="admin-panel__lede">
                Choose Work or Personal in the area switcher to write a daily
                note. All is for browsing lists only.
              </p>
            </>
          )}
        </div>
        <TodayTasksPanel area={writingArea ?? undefined} />
      </div>
    </section>
  );
}
