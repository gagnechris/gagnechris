import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  useCreateTaskMutation,
  useTasksQuery,
  type NotebookArea,
  type Task,
} from '@gagnechris/app-core';
import type { TaskPriority, TaskStatus } from '@gagnechris/shared';
import { createUlid } from '../lib/ulid';
import { addLocalDays, localToday, parseLocalDate } from '../kit/calendarDates';
import { areaQueryParam } from './notebookAreaPreference';
import { parseTaskQuickAdd } from '../kit/tasks/parseTaskQuickAdd';
import { TaskRow } from '../kit/tasks/TaskRow';
import { useTaskToggle } from './useTaskToggle';
import type { NotebookOutletContext } from './NotebookLayout';

type DueFilter = '' | 'overdue' | 'today' | 'week' | 'none';

function endOfLocalWeek(today: string): string {
  const d = parseLocalDate(today);
  if (!d) return today;
  // Sunday = 0 … Saturday = 6; inclusive end of this calendar week (Sat).
  const day = d.getDay();
  const toSat = day === 0 ? 6 : 6 - day;
  return addLocalDays(today, toSat);
}

function matchesDueFilter(task: Task, due: DueFilter, today: string): boolean {
  if (!due) return true;
  if (due === 'none') return task.dueDate === null;
  if (due === 'today') return task.dueDate === today;
  if (due === 'overdue') return task.dueDate !== null && task.dueDate < today;
  if (due === 'week') {
    if (!task.dueDate) return false;
    const weekEnd = endOfLocalWeek(today);
    return task.dueDate >= today && task.dueDate <= weekEnd;
  }
  return true;
}

export default function NotebookTasksPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const area = areaQueryParam(areaFilter);
  const today = localToday();

  const [quickAdd, setQuickAdd] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [due, setDue] = useState<DueFilter>('');
  const [showCompleted, setShowCompleted] = useState(false);

  const listQuery: {
    area?: NotebookArea;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueOn?: string;
    dueBefore?: string;
    open?: boolean;
    today: string;
    limit: number;
  } = {
    area,
    today,
    limit: 50,
  };
  if (status) listQuery.status = status;
  if (priority) listQuery.priority = priority;
  if (due === 'today') listQuery.dueOn = today;
  if (due === 'overdue') listQuery.dueBefore = today;

  // Default view reads open tasks only; Completed loads when expanded, so a
  // pile of done tasks can never push open ones off the page.
  const tasksQuery = useTasksQuery(
    status ? listQuery : { ...listQuery, open: true },
  );
  const completedQuery = useTasksQuery(
    { ...listQuery, status: 'done' },
    { enabled: showCompleted && !status },
  );
  const createMutation = useCreateTaskMutation();
  const { toggle: toggleTask, error: toggleError } = useTaskToggle();
  const [quickAddHint, setQuickAddHint] = useState<string | null>(null);

  const { openItems, doneItems } = useMemo(() => {
    const main = tasksQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const completed = status
      ? main
      : (completedQuery.data?.pages.flatMap((page) => page.items) ?? []);
    const matches = (t: Task) => matchesDueFilter(t, due, today);
    return {
      openItems: main.filter((t) => t.status !== 'done' && matches(t)),
      doneItems: completed.filter((t) => t.status === 'done' && matches(t)),
    };
  }, [tasksQuery.data, completedQuery.data, status, due, today]);
  const completedSource = status ? tasksQuery : completedQuery;
  const showCompletedSection =
    status === 'done' || (!status && (doneItems.length > 0 || !showCompleted));

  const submitQuickAdd = async () => {
    const parsed = parseTaskQuickAdd(quickAdd, today);
    if (!parsed.title) {
      setQuickAddHint('Add a title before the due date.');
      return;
    }
    setQuickAddHint(null);
    const createArea: NotebookArea =
      areaFilter === 'personal' ? 'personal' : 'work';
    await createMutation.mutateAsync({
      id: createUlid(),
      area: createArea,
      title: parsed.title,
      description: '',
      priority: parsed.priority,
      status: 'todo',
      dueDate: parsed.dueDate,
      tags: [],
    });
    setQuickAdd('');
  };

  const toggleComplete = (task: Task) => {
    void toggleTask(task);
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h1>Tasks</h1>
          <p className="admin-panel__lede">
            {areaFilter === 'all'
              ? 'All areas'
              : areaFilter === 'work'
                ? 'Work'
                : 'Personal'}
            {' · '}
            quick-add supports <code>!high</code> and a trailing{' '}
            <code>today</code> / <code>tomorrow</code>
          </p>
        </div>
      </div>

      <form
        className="admin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void submitQuickAdd();
        }}
      >
        <input
          className="admin-input"
          type="text"
          placeholder="Add a task and press Enter"
          value={quickAdd}
          onChange={(e) => {
            setQuickAdd(e.target.value);
            setQuickAddHint(null);
          }}
          aria-label="Quick add task"
          disabled={createMutation.isPending}
        />
        <button
          type="submit"
          className="admin-btn admin-btn--primary"
          disabled={createMutation.isPending || !quickAdd.trim()}
        >
          Add
        </button>
      </form>
      {quickAddHint ? <p className="admin-hint">{quickAddHint}</p> : null}
      {toggleError ? (
        <p className="admin-panel__error" role="alert">
          {toggleError}
        </p>
      ) : null}

      <div className="admin-toolbar">
        <label className="admin-field">
          <span className="admin-field__label">Status</span>
          <select
            className="admin-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus | '')}
            aria-label="Filter by status"
          >
            <option value="">Any</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className="admin-field">
          <span className="admin-field__label">Priority</span>
          <select
            className="admin-input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | '')}
            aria-label="Filter by priority"
          >
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="med">Med</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="admin-field">
          <span className="admin-field__label">Due</span>
          <select
            className="admin-input"
            value={due}
            onChange={(e) => setDue(e.target.value as DueFilter)}
            aria-label="Filter by due date"
          >
            <option value="">Any</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="none">No date</option>
          </select>
        </label>
      </div>

      {tasksQuery.isError ? (
        <p className="admin-panel__error" role="alert">
          Could not load tasks.
        </p>
      ) : null}

      {tasksQuery.isPending ? <p>Loading tasks…</p> : null}

      {!tasksQuery.isPending &&
      openItems.length === 0 &&
      doneItems.length === 0 &&
      (status || showCompleted) ? (
        <p className="admin-hint">No tasks match.</p>
      ) : null}

      {openItems.length > 0 ? (
        <ul className="admin-post-list" aria-label="Open tasks">
          {openItems.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              onToggle={() => toggleComplete(task)}
            />
          ))}
        </ul>
      ) : null}

      {showCompletedSection ? (
        <details
          className="admin-notebook-completed"
          open={showCompleted || status === 'done'}
          onToggle={(e) =>
            setShowCompleted((e.target as HTMLDetailsElement).open)
          }
        >
          <summary>
            Completed
            {showCompleted || status === 'done'
              ? ` (${doneItems.length}${completedSource.hasNextPage ? '+' : ''})`
              : ''}
          </summary>
          <ul className="admin-post-list" aria-label="Completed tasks">
            {doneItems.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                onToggle={() => toggleComplete(task)}
              />
            ))}
          </ul>
          {!status && completedQuery.hasNextPage ? (
            <button
              type="button"
              className="admin-btn"
              disabled={completedQuery.isFetchingNextPage}
              onClick={() => void completedQuery.fetchNextPage()}
            >
              Load more completed
            </button>
          ) : null}
        </details>
      ) : null}

      {tasksQuery.hasNextPage ? (
        <button
          type="button"
          className="admin-btn"
          disabled={tasksQuery.isFetchingNextPage}
          onClick={() => void tasksQuery.fetchNextPage()}
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}

function TaskListRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return (
    <TaskRow
      task={task}
      onToggle={onToggle}
      to={`/tasks/${task.id}`}
      variant="list"
      meta={
        <>
          {task.area}
          {task.dueDate ? ` · due ${task.dueDate}` : ' · no due date'}
        </>
      }
    />
  );
}
