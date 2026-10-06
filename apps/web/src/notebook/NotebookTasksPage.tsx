import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  useTasksQuery,
  type NotebookArea,
  type Task,
} from '@gagnechris/app-core';
import {
  addDays,
  type TaskPriority,
  type TaskStatus,
  weekdayOf,
} from '@gagnechris/shared';
import { areaQueryParam } from './notebookAreaPreference';
import { TaskDuePill } from '../kit/tasks/TaskDuePill';
import { TaskRow } from '../kit/tasks/TaskRow';
import { taskDue } from '../kit/tasks/taskDue';
import { TaskSyntaxInput } from '../kit/tasks/TaskSyntaxInput';
import { useLocalToday } from './useLocalToday';
import { useQuickAddTask } from './useQuickAddTask';
import { useTaskToggle } from './useTaskToggle';
import type { NotebookOutletContext } from './NotebookLayout';

const SHOW_ON_FILTERS = [
  '',
  'earlier',
  'today',
  'week',
  'later',
  'none',
  'someday',
] as const;

type ShowOnFilter = (typeof SHOW_ON_FILTERS)[number];

const showOnParam = (value: string | null): ShowOnFilter =>
  SHOW_ON_FILTERS.find((f) => f === value) ?? '';

function endOfLocalWeek(today: string): string {
  const day = weekdayOf(today);
  if (day === null) return today;
  // Sunday = 0 … Saturday = 6; inclusive end of this calendar week (Sat).
  return addDays(today, day === 0 ? 6 : 6 - day);
}

function matchesShowOnFilter(
  task: Task,
  showOn: ShowOnFilter,
  today: string,
): boolean {
  if (!showOn) return true;
  if (showOn === 'someday') return task.someday;
  if (task.someday) return false;
  if (showOn === 'none') return task.startDate === null;
  if (showOn === 'later') {
    return task.startDate !== null && task.startDate > today;
  }
  if (showOn === 'today') return task.startDate === today;
  if (showOn === 'earlier') {
    return task.startDate !== null && task.startDate < today;
  }
  if (showOn === 'week') {
    if (!task.startDate) return false;
    const weekEnd = endOfLocalWeek(today);
    return task.startDate >= today && task.startDate <= weekEnd;
  }
  return true;
}

export default function NotebookTasksPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const area = areaQueryParam(areaFilter);
  const today = useLocalToday();

  const [quickAdd, setQuickAdd] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const showOn = showOnParam(searchParams.get('show'));
  const setShowOn = (next: ShowOnFilter) =>
    setSearchParams(
      (params) => {
        if (next) params.set('show', next);
        else params.delete('show');
        return params;
      },
      { replace: true },
    );
  const [showCompleted, setShowCompleted] = useState(false);

  const listQuery: {
    area?: NotebookArea;
    status?: TaskStatus;
    priority?: TaskPriority;
    startOn?: string;
    startAfter?: string;
    someday?: boolean;
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
  if (showOn === 'today') listQuery.startOn = today;
  if (showOn === 'later') listQuery.startAfter = today;
  if (showOn === 'someday') listQuery.someday = true;

  // Default view reads open tasks only; Completed loads when expanded, so a
  // pile of done tasks can never push open ones off the page.
  const tasksQuery = useTasksQuery(
    status ? listQuery : { ...listQuery, open: true },
  );
  const completedQuery = useTasksQuery(
    { ...listQuery, status: 'done' },
    { enabled: showCompleted && !status },
  );
  const quickAddTask = useQuickAddTask(areaFilter);
  const { toggle: toggleTask, error: toggleError } = useTaskToggle();

  const { openItems, doneItems } = useMemo(() => {
    const main = tasksQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const completed = status
      ? main
      : (completedQuery.data?.pages.flatMap((page) => page.items) ?? []);
    const matches = (t: Task) => matchesShowOnFilter(t, showOn, today);
    return {
      openItems: main.filter((t) => t.status !== 'done' && matches(t)),
      doneItems: completed.filter((t) => t.status === 'done' && matches(t)),
    };
  }, [tasksQuery.data, completedQuery.data, status, showOn, today]);
  const completedSource = status ? tasksQuery : completedQuery;
  const showCompletedSection =
    status === 'done' || (!status && (doneItems.length > 0 || !showCompleted));

  const submitQuickAdd = async () => {
    if (await quickAddTask.submit(quickAdd, today)) setQuickAdd('');
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
            quick-add supports <code>@tomorrow</code>, <code>@mon</code>,{' '}
            <code>@oct 12</code>, <code>@someday</code>, <code>due:fri</code>{' '}
            and <code>!high</code>
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
        <TaskSyntaxInput
          today={today}
          placeholder="Add a task and press Enter"
          value={quickAdd}
          onChange={(next) => {
            setQuickAdd(next);
            quickAddTask.clearMessages();
          }}
          aria-label="Quick add task"
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
        <p className="admin-hint">{quickAddTask.hint}</p>
      ) : null}
      {(quickAddTask.error ?? toggleError) ? (
        <p className="admin-panel__error" role="alert">
          {quickAddTask.error ?? toggleError}
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
            <option value="dropped">Dropped</option>
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
          <span className="admin-field__label">Show on</span>
          <select
            className="admin-input"
            value={showOn}
            onChange={(e) => setShowOn(e.target.value as ShowOnFilter)}
            aria-label="Filter by show-on date"
          >
            <option value="">Any</option>
            <option value="earlier">Before today</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="later">After today</option>
            <option value="none">No date</option>
            <option value="someday">Someday</option>
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
        <ul
          className="admin-post-list"
          aria-label={status === 'dropped' ? 'Dropped tasks' : 'Open tasks'}
        >
          {openItems.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              today={today}
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
                today={today}
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

function TaskListRow({
  task,
  today,
  onToggle,
}: {
  task: Task;
  today: string;
  onToggle: () => void;
}) {
  return (
    <TaskRow
      task={task}
      onToggle={onToggle}
      to={`/tasks/${task.id}`}
      variant="list"
      meta={
        <>
          {task.area}
          {task.someday
            ? ' · someday'
            : task.startDate
              ? ` · shows ${task.startDate}`
              : ' · no date'}{' '}
          <TaskDuePill due={taskDue(task, today)} />
        </>
      }
    />
  );
}
