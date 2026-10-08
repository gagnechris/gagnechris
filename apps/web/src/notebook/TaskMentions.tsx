import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useNotesQuery } from '@gagnechris/app-core';
import { noteDay, noteDayLabel, noteTitle } from '@gagnechris/shared';
import { taskMentions } from './taskMentionsData';
import { useLocalToday } from './useLocalToday';
import { useLoadAllPages } from './useTodayTasks';

type Props = {
  taskId: string;
  homeNoteId: string | null;
};

/** Every note that embeds the task, with the prose written under the embed. */
export function TaskMentions({ taskId, homeNoteId }: Props) {
  const today = useLocalToday();
  // Every area: a note can embed a task from the other one.
  const notesQuery = useNotesQuery({ limit: 100 });
  useLoadAllPages(notesQuery);

  const mentions = useMemo(() => {
    const notes = notesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return taskMentions(notes, taskId, homeNoteId);
  }, [notesQuery.data, taskId, homeNoteId]);

  const loading = notesQuery.isPending || notesQuery.hasNextPage;

  return (
    <section className="notebook-mentions" aria-labelledby="task-mentions">
      <h2 id="task-mentions">Mentioned in</h2>
      {notesQuery.isError ? (
        <p className="admin-panel__error" role="alert">
          Could not load notes.
        </p>
      ) : loading ? (
        <p className="admin-hint">Loading notes…</p>
      ) : mentions.length === 0 ? (
        <p className="admin-hint">No note embeds this task yet.</p>
      ) : (
        <ul className="notebook-mentions__list">
          {mentions.map(({ note, context, home }) => (
            <li key={note.id} data-note-id={note.id}>
              <Link to={`/notes/${note.id}`} className="notebook-mentions__row">
                <span className="notebook-mentions__title">
                  {noteTitle(note)}
                  {home ? <span className="admin-badge">home</span> : null}
                </span>
                {/* A daily note's title is already its date. */}
                {note.type === 'page' ? (
                  <span className="notebook-mentions__when">
                    {noteDayLabel(noteDay(note), today)}
                  </span>
                ) : null}
                {context ? (
                  <span className="notebook-mentions__context">{context}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
