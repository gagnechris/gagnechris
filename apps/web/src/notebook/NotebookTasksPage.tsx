import { useMemo, useState, type ReactNode } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  useTasksQuery,
  useQuickAddTask,
  useTaskPatch,
  useTaskToggle,
  type Task,
} from '@gagnechris/app-core';
import {
  matchesTaskShowOn,
  notebookAreaName,
  snoozeBaseDay,
  sortTasksForList,
  taskDue,
  taskShowOnParam,
  taskShowOnQuery,
  type TaskPriority,
  type TaskShowOnFilter,
  type NotebookAreaEntry,
  type TaskStatus,
} from '@gagnechris/shared';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
} from '../kit/tasks/taskOptions';
import { TaskDuePill } from '../kit/tasks/TaskDuePill';
import { TaskRow } from '../kit/tasks/TaskRow';
import { TaskParentsProvider } from './TaskParentsProvider';
import { TaskRowActions } from '../kit/tasks/TaskRowActions';
import { TaskSyntaxInput } from '../kit/tasks/TaskSyntaxInput';
import { Button, Field, SegmentedRadio, Select } from '@gagnechris/ui';
import { useLocalToday } from './useLocalToday';

import type { NotebookOutletContext } from './NotebookLayout';

type TaskChip = 'open' | 'today' | 'upcoming' | 'someday' | 'done';

const TASK_CHIPS: { value: TaskChip; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'someday', label: 'Someday' },
  { value: 'done', label: 'Done' },
];

const CHIP_SHOW_ON: Record<TaskChip, TaskShowOnFilter> = {
  open: '',
  today: 'today',
  upcoming: 'later',
  someday: 'someday',
  done: '',
};

export default function NotebookTasksPage() {
  const {
    area: current,
    areaName,
    areas,
  } = useOutletContext<NotebookOutletContext>();
  const today = useLocalToday();
  // Every area unless one is picked here; quick-add files into the switch's.
  const [listArea, setListArea] = useState('');
  const area = areas.some((a) => a.id === listArea) ? listArea : undefined;

  const [quickAdd, setQuickAdd] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const showOn = taskShowOnParam(searchParams.get('show'));
  const setShowOn = (next: TaskShowOnFilter) =>
    setSearchParams(
      (params) => {
        if (next) params.set('show', next);
        else params.delete('show');
        return params;
      },
      { replace: true },
    );
  const [showCompleted, setShowCompleted] = useState(false);

  const listQuery = {
    area,
    today,
    limit: 50,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...taskShowOnQuery(showOn, today),
  };

  // Default view reads open tasks only; Completed loads when expanded, so a
  // pile of done tasks can never push open ones off the page.
  const tasksQuery = useTasksQuery(
    status ? listQuery : { ...listQuery, open: true },
  );
  const completedQuery = useTasksQuery(
    { ...listQuery, status: 'done' },
    { enabled: showCompleted && !status },
  );
  const quickAddTask = useQuickAddTask(current);
  const { toggle: toggleTask, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const actionError = quickAddTask.error ?? toggleError ?? patchError;

  // The phone filters: each chip stands for one combination of the selects.
  const chip: TaskChip | '' =
    status === 'done' && !priority && !showOn
      ? 'done'
      : !status && !priority
        ? (TASK_CHIPS.find(
            (c) => c.value !== 'done' && CHIP_SHOW_ON[c.value] === showOn,
          )?.value ?? '')
        : '';
  const pickChip = (next: TaskChip) => {
    setStatus(next === 'done' ? 'done' : '');
    setPriority('');
    setShowOn(CHIP_SHOW_ON[next]);
  };

  const { openItems, doneItems } = useMemo(() => {
    const main = tasksQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const completed = status
      ? main
      : (completedQuery.data?.pages.flatMap((page) => page.items) ?? []);
    const matches = (t: Task) => matchesTaskShowOn(t, showOn, today);
    return {
      openItems: sortTasksForList(
        main.filter((t) => t.status !== 'done' && matches(t)),
        today,
      ),
      doneItems: completed.filter((t) => t.status === 'done' && matches(t)),
    };
  }, [tasksQuery.data, completedQuery.data, status, showOn, today]);
  const completedSource = status ? tasksQuery : completedQuery;
  const showCompletedSection =
    status === 'done' || (!status && (doneItems.length > 0 || !showCompleted));

  const submitQuickAdd = async () => {
    if (await quickAddTask.submit(quickAdd, today)) setQuickAdd('');
  };

  const listed = useMemo(
    () => [...openItems, ...doneItems],
    [openItems, doneItems],
  );

  const toggleComplete = (task: Task) => {
    void toggleTask(task);
  };

  return (
    <TaskParentsProvider tasks={listed}>
      <section className="workspace-panel">
        <div className="workspace-panel__header">
          <div>
            <h1>Tasks</h1>
            <p className="workspace-panel__lede">
              New tasks go to {areaName}
              {' · '}
              quick-add supports <code>@tomorrow</code>, <code>@mon</code>,{' '}
              <code>@oct 12</code>, <code>@someday</code>, <code>due:fri</code>{' '}
              and <code>!high</code>
            </p>
          </div>
        </div>

        <form
          className="workspace-toolbar"
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
          <Button
            type="submit"
            variant="primary"
            disabled={quickAddTask.pending || !quickAdd.trim()}
          >
            Add
          </Button>
        </form>
        {quickAddTask.hint ? (
          <p className="kit-hint">{quickAddTask.hint}</p>
        ) : null}
        {actionError ? (
          <p className="workspace-panel__error" role="alert">
            {actionError}
          </p>
        ) : null}

        <SegmentedRadio<TaskChip | ''>
          label="Show tasks"
          className="notebook-tasks__chips"
          options={TASK_CHIPS}
          value={chip}
          onChange={(next) => {
            if (next) pickChip(next);
          }}
        />
        <div className="workspace-toolbar notebook-tasks__filters">
          <Field label="Area">
            <Select
              value={area ?? ''}
              onChange={(e) => setListArea(e.target.value)}
              aria-label="Filter by area"
            >
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus | '')}
              aria-label="Filter by status"
            >
              <option value="">Any</option>
              {TASK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority | '')}
              aria-label="Filter by priority"
            >
              <option value="">Any</option>
              {TASK_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Show on">
            <Select
              value={showOn}
              onChange={(e) => setShowOn(e.target.value as TaskShowOnFilter)}
              aria-label="Filter by show-on date"
            >
              <option value="">Any</option>
              <option value="earlier">Before today</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="later">After today</option>
              <option value="none">No date</option>
              <option value="someday">Someday</option>
            </Select>
          </Field>
        </div>

        {tasksQuery.isError ? (
          <p className="workspace-panel__error" role="alert">
            Could not load tasks.
          </p>
        ) : null}

        {tasksQuery.isPending ? <p>Loading tasks…</p> : null}

        {!tasksQuery.isPending &&
        openItems.length === 0 &&
        doneItems.length === 0 &&
        (status || priority || showOn || showCompleted) ? (
          <p className="kit-hint">No tasks match.</p>
        ) : null}

        {openItems.length > 0 ? (
          <ul
            className="kit-list"
            aria-label={status === 'dropped' ? 'Dropped tasks' : 'Open tasks'}
          >
            {openItems.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                today={today}
                areas={areas}
                onToggle={() => toggleComplete(task)}
                actions={
                  task.status === 'dropped' ? null : (
                    <TaskRowActions
                      title={task.title}
                      snoozeFrom={snoozeBaseDay(task.startDate ?? today, today)}
                      onSnooze={(schedule) => void patch(task, schedule)}
                      onDrop={() => void patch(task, { status: 'dropped' })}
                    />
                  )
                }
              />
            ))}
          </ul>
        ) : null}

        {showCompletedSection ? (
          <details
            className="notebook-completed"
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
            <ul className="kit-list" aria-label="Completed tasks">
              {doneItems.map((task) => (
                <TaskListRow
                  key={task.id}
                  task={task}
                  today={today}
                  areas={areas}
                  onToggle={() => toggleComplete(task)}
                />
              ))}
            </ul>
            {!status && completedQuery.hasNextPage ? (
              <Button
                disabled={completedQuery.isFetchingNextPage}
                onClick={() => void completedQuery.fetchNextPage()}
              >
                Load more completed
              </Button>
            ) : null}
          </details>
        ) : null}

        {tasksQuery.hasNextPage ? (
          <Button
            disabled={tasksQuery.isFetchingNextPage}
            onClick={() => void tasksQuery.fetchNextPage()}
          >
            Load more
          </Button>
        ) : null}
      </section>
    </TaskParentsProvider>
  );
}

function TaskListRow({
  task,
  today,
  areas,
  onToggle,
  actions,
}: {
  task: Task;
  today: string;
  areas: readonly NotebookAreaEntry[];
  onToggle: () => void;
  actions?: ReactNode;
}) {
  return (
    <TaskRow
      task={task}
      onToggle={onToggle}
      actions={actions}
      to={`/tasks/${task.id}`}
      variant="list"
      meta={
        <>
          {notebookAreaName(areas, task.area)}
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
