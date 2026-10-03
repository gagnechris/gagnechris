import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCompleteTaskMutation,
  useCreateTaskMutation,
  useReopenTaskMutation,
  useTasksQuery,
  type NotebookArea,
  type Task,
} from '@gagnechris/app-core';
import { createUlid } from '../../lib/ulid';
import { addLocalDays, formatLocalDate } from './calendarDates';
import { parseTaskQuickAdd } from './parseTaskQuickAdd';
import {
  bucketTodayTasks,
  showTomorrowPreview,
  todayProgress,
} from './todayTaskBuckets';

type Props = {
  area: NotebookArea | undefined;
  /** Override "now" for tests (tomorrow preview + today string). */
  now?: Date;
};

export default function TodayTasksPanel({ area, now }: Props) {
  const clock = now ?? new Date();
  const today = formatLocalDate(clock);
  const [quickAdd, setQuickAdd] = useState('');

  const tasksQuery = useTasksQuery({
    area,
    limit: 100,
  });
  const createMutation = useCreateTaskMutation();
  const completeMutation = useCompleteTaskMutation();
  const reopenMutation = useReopenTaskMutation();

  const items = useMemo(
    () => tasksQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [tasksQuery.data],
  );
  const buckets = useMemo(() => bucketTodayTasks(items, today), [items, today]);
  const progress = todayProgress(buckets);
  const showTomorrow = showTomorrowPreview(clock);

  const createArea: NotebookArea = area ?? 'work';

  const submitQuickAdd = async () => {
    const parsed = parseTaskQuickAdd(quickAdd, today);
    if (!parsed.title) return;
    await createMutation.mutateAsync({
      id: createUlid(),
      area: createArea,
      title: parsed.title,
      description: '',
      priority: parsed.priority,
      status: 'todo',
      dueDate: parsed.dueDate ?? today,
      tags: [],
    });
    setQuickAdd('');
  };

  const toggle = (task: Task) => {
    if (task.status === 'done') {
      void reopenMutation.mutateAsync({ id: task.id, version: task.version });
    } else {
      void completeMutation.mutateAsync({ id: task.id, version: task.version });
    }
  };

  return (
    <aside className="notebook-today__tasks" aria-label="Today tasks">
      <div className="admin-panel__header" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h2 className="notebook-today__tasks-title">Tasks</h2>
          <p className="admin-panel__lede" style={{ margin: 0 }}>
            {progress.total > 0
              ? `${progress.done}/${progress.total} due today`
              : 'Nothing due today'}
            {area ? '' : ' · all areas'}
          </p>
        </div>
        <Link to="/admin/notebook/tasks" className="admin-back">
          All tasks →
        </Link>
      </div>

      {progress.total > 0 ? (
        <div
          className="notebook-today__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label="Today task progress"
        >
          <div
            className="notebook-today__progress-bar"
            style={{
              width: `${Math.round((progress.done / progress.total) * 100)}%`,
            }}
          />
        </div>
      ) : null}

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
          placeholder="Quick-add task (defaults due today)"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          aria-label="Quick add task for today"
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

      {tasksQuery.isError ? (
        <p className="admin-panel__error" role="alert">
          Could not load tasks.
        </p>
      ) : null}

      {tasksQuery.isPending ? <p>Loading tasks…</p> : null}

      <TaskSection
        title="Overdue"
        tasks={buckets.overdue}
        onToggle={toggle}
        empty="None overdue."
      />
      <TaskSection
        title="Due today"
        tasks={buckets.dueToday}
        onToggle={toggle}
        empty="Nothing due today."
      />
      <TaskSection
        title="In progress"
        tasks={buckets.inProgress}
        onToggle={toggle}
        empty="No other in-progress tasks."
      />

      {showTomorrow ? (
        <TaskSection
          title={`Tomorrow (${addLocalDays(today, 1)})`}
          tasks={buckets.tomorrow}
          onToggle={toggle}
          empty="Nothing due tomorrow."
        />
      ) : null}
    </aside>
  );
}

function TaskSection({
  title,
  tasks,
  onToggle,
  empty,
}: {
  title: string;
  tasks: Task[];
  onToggle: (task: Task) => void;
  empty: string;
}) {
  return (
    <section className="notebook-today__task-section">
      <h3>
        {title}
        {tasks.length > 0 ? ` (${tasks.length})` : ''}
      </h3>
      {tasks.length === 0 ? (
        <p className="admin-hint">{empty}</p>
      ) : (
        <ul className="admin-post-list">
          {tasks.map((task) => (
            <li key={task.id} className="admin-post-list__item">
              <div
                className="admin-post-list__link"
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-start',
                }}
              >
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={() => onToggle(task)}
                  aria-label={
                    task.status === 'done'
                      ? `Reopen ${task.title}`
                      : `Complete ${task.title}`
                  }
                />
                <Link
                  to={`/admin/notebook/tasks/${task.id}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span className="admin-post-list__title">
                    {task.title}
                    <span className="admin-badge">{task.priority}</span>
                  </span>
                  <span className="admin-post-list__meta">
                    {task.area}
                    {task.dueDate ? ` · ${task.dueDate}` : ''}
                  </span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
