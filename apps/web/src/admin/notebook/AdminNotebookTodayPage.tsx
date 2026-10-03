import { useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  dailyNoteResource,
  useDailyNoteDatesQuery,
  type NotebookArea,
} from '@gagnechris/app-core';
import { SaveIndicator } from '../../ui/SaveIndicator';
import type { NotebookOutletContext } from '../AdminNotebookLayout';
import { useVersionedDocEditor } from '../useVersionedDocEditor';
import {
  addLocalDays,
  localToday,
  monthBounds,
  parseLocalDate,
} from './calendarDates';
import { NotebookCalendar } from './NotebookCalendar';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from './noteDraft';
import TodayTasksPanel from './TodayTasksPanel';

function resolveDate(param: string | null): string {
  if (param && parseLocalDate(param)) return param;
  return localToday();
}

function TodayEditor({ area, date }: { area: NotebookArea; date: string }) {
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
    loadErrorFallback: 'Could not load daily note.',
  });

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
          <h1>Today</h1>
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

export default function AdminNotebookTodayPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = resolveDate(searchParams.get('date'));
  const { from, to } = useMemo(() => monthBounds(date), [date]);

  const writingArea: NotebookArea | null =
    areaFilter === 'all' ? null : areaFilter;

  const datesQuery = useDailyNoteDatesQuery(
    writingArea ?? undefined,
    from,
    to,
    writingArea !== null,
  );

  const setDate = (next: string) => {
    const today = localToday();
    if (next === today) {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ date: next }, { replace: true });
    }
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
              onClick={() => setDate(localToday())}
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
        <div className="notebook-today__editor">
          {writingArea ? (
            <TodayEditor
              key={`${writingArea}:${date}`}
              area={writingArea}
              date={date}
            />
          ) : (
            <>
              <h1>Today</h1>
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
