import { useCallback, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useNotesByIds, useTasksQuery, type Task } from '@gagnechris/app-core';
import {
  formatTaskDay,
  groupUpcomingTasks,
  noteChipLabel,
  type SourceNote,
  taskDue,
} from '@gagnechris/shared';
import { TaskDuePill } from '../kit/tasks/TaskDuePill';
import { TaskCheckbox } from '../kit/tasks/TaskRow';
import type { TaskLineDraft } from '../kit/tasks/taskLine';
import { TaskSyntaxInput } from '../kit/tasks/TaskSyntaxInput';
import {
  areaQueryParam,
  NOTEBOOK_AREA_HEADINGS,
} from './notebookAreaPreference';
import type { NotebookOutletContext } from './NotebookLayout';
import { useLocalToday } from './useLocalToday';
import { useQuickAddTask } from './useQuickAddTask';
import { useTaskToggle } from './useTaskToggle';
import { useLoadAllPages, useTaskPatch } from './useTodayTasks';

export default function NotebookUpcomingPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const area = areaQueryParam(areaFilter);
  const today = useLocalToday();

  const scheduled = useTasksQuery({
    area,
    open: true,
    startAfter: today,
    today,
    limit: 100,
  });
  const parked = useTasksQuery({ area, open: true, someday: true, limit: 100 });
  useLoadAllPages(scheduled);
  useLoadAllPages(parked);

  const groups = useMemo(
    () =>
      groupUpcomingTasks(
        [
          ...(scheduled.data?.pages.flatMap((p) => p.items) ?? []),
          ...(parked.data?.pages.flatMap((p) => p.items) ?? []),
        ],
        today,
      ),
    [scheduled.data, parked.data, today],
  );

  const noteIds = useMemo(
    () => [
      ...new Set(
        groups.flatMap((g) =>
          g.tasks.flatMap((t) => (t.noteId ? [t.noteId] : [])),
        ),
      ),
    ],
    [groups],
  );
  const noteResults = useNotesByIds(noteIds);
  const notesById = new Map<string, SourceNote>();
  noteIds.forEach((id, i) => {
    const note = noteResults[i]?.data;
    if (note && !note.deleted) notesById.set(id, note);
  });

  const { toggle, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const [quickAdd, setQuickAdd] = useState('');
  const hintAfterCreate = useCallback(
    (draft: TaskLineDraft) =>
      !draft.someday && (!draft.startDate || draft.startDate <= today)
        ? `“${draft.title}” has no later date, so it shows on Today.`
        : null,
    [today],
  );
  const quickAddTask = useQuickAddTask(areaFilter, { hintAfterCreate });
  const submit = async () => {
    if (await quickAddTask.submit(quickAdd, today)) setQuickAdd('');
  };

  const doToday = (task: Task) =>
    void patch(task, { startDate: today, someday: false }, 'move');

  const loading =
    scheduled.isPending ||
    parked.isPending ||
    scheduled.hasNextPage ||
    parked.hasNextPage;
  const error = toggleError ?? patchError ?? quickAddTask.error;

  return (
    <section className="admin-panel notebook-upcoming">
      <div className="admin-panel__header">
        <div>
          <p className="notebook-today__kicker">
            {NOTEBOOK_AREA_HEADINGS[areaFilter]}
          </p>
          <h1>Upcoming</h1>
          <p className="admin-panel__lede">
            Tasks hidden until their day. Each one shows on Today from that day.
          </p>
        </div>
      </div>

      <form
        className="admin-toolbar notebook-upcoming__add"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TaskSyntaxInput
          today={today}
          placeholder="Schedule a task… e.g. Renew passport @nov 1"
          value={quickAdd}
          onChange={(next) => {
            setQuickAdd(next);
            quickAddTask.clearMessages();
          }}
          aria-label="Schedule a task"
          disabled={quickAddTask.pending}
        />
        <button
          type="submit"
          className="admin-btn admin-btn--primary"
          disabled={quickAddTask.pending || !quickAdd.trim()}
        >
          Add
        </button>
      </form>
      {quickAddTask.hint ? (
        <p className="admin-hint" role="status">
          {quickAddTask.hint}
        </p>
      ) : null}
      {error ? (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      {scheduled.isError || parked.isError ? (
        <p className="admin-panel__error" role="alert">
          Could not load tasks.
        </p>
      ) : loading ? (
        <p className="admin-hint">Loading tasks…</p>
      ) : groups.length === 0 ? (
        <p className="admin-hint">
          Nothing scheduled. Add <code>@mon</code>, <code>@oct 12</code> or{' '}
          <code>@someday</code> to a task to see it here.
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            className="notebook-upcoming__group"
            aria-labelledby={`upcoming-${group.key}`}
          >
            <header className="notebook-upcoming__group-header">
              <h2 id={`upcoming-${group.key}`}>{group.label}</h2>
              <span>{group.sub}</span>
            </header>
            <ul className="notebook-upcoming__list">
              {group.tasks.map((task) => {
                const note = task.noteId
                  ? notesById.get(task.noteId)
                  : undefined;
                return (
                  <li
                    key={task.id}
                    className="notebook-upcoming__row"
                    data-task-id={task.id}
                  >
                    <TaskCheckbox
                      task={task}
                      onToggle={() => void toggle(task)}
                    />
                    <span className="notebook-upcoming__body">
                      <Link
                        to={`/tasks/${task.id}`}
                        className="notebook-upcoming__title"
                      >
                        {task.title}
                      </Link>
                      {group.datedRows && task.startDate ? (
                        <span className="notebook-upcoming__chip">
                          {formatTaskDay(task.startDate)}
                        </span>
                      ) : null}
                      <TaskDuePill due={taskDue(task, today)} />
                      {note ? (
                        <Link
                          to={`/notes/${note.id}`}
                          className="notebook-upcoming__chip"
                        >
                          {noteChipLabel(note)}
                        </Link>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="admin-btn notebook-upcoming__today"
                      aria-label={`Do “${task.title}” today`}
                      onClick={() => doToday(task)}
                    >
                      Do today
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
