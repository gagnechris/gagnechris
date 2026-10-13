import { useState, type ReactNode } from 'react';
import {
  taskActionError,
  usePatchTaskMutation,
  useTaskDescriptionEditor,
  useTaskToggle,
  type Task,
  type TaskPatch,
} from '@gagnechris/app-core';
import {
  formatTaskDay,
  parseTagsText,
  taskScheduleLabel,
  type TaskPriority,
  type TaskStatus,
} from '@gagnechris/shared';
import { TaskDateButton } from '../kit/tasks/TaskDateButton';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useLocalToday } from './useLocalToday';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  dropped: 'Dropped',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High priority',
  med: 'Medium priority',
  low: 'Low priority',
};

function TagsChip({
  tags,
  onChange,
}: {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (editing === null) {
    return (
      <button
        type="button"
        className="task-details__chip"
        aria-label={tags.length ? `Tags: ${tags.join(', ')}` : 'Add tags'}
        onClick={() => setEditing(tags.join(', '))}
      >
        {tags.length ? tags.map((t) => `#${t}`).join(' ') : 'Add tags'}
      </button>
    );
  }
  const commit = () => {
    const next = parseTagsText(editing);
    setEditing(null);
    if (next.join(',') !== tags.join(',')) onChange(next);
  };
  return (
    <input
      className="task-details__chip task-details__tags-input"
      aria-label="Tags (comma-separated)"
      value={editing}
      autoFocus
      onChange={(e) => setEditing(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setEditing(null);
        }
      }}
    />
  );
}

export type DescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
};

/** A task's description and fields, under its row in a note. */
export function TaskDetailsPanel({
  task,
  renderEditor,
  moveMenu,
}: {
  task: Task;
  /** The note's own editor, passed in since it renders these panels. */
  renderEditor: (props: DescriptionEditorProps) => ReactNode;
  /** Move to…, under its chip. */
  moveMenu?: (close: () => void) => ReactNode;
}) {
  const [moving, setMoving] = useState(false);
  const today = useLocalToday();
  const description = useTaskDescriptionEditor(task);
  const { mutateAsync: patchTask } = usePatchTaskMutation();
  const { toggle, error: toggleError } = useTaskToggle();
  const [patchError, setPatchError] = useState<string | null>(null);

  const patch = (changes: TaskPatch) => {
    setPatchError(null);
    patchTask({ id: task.id, version: task.version, patch: changes }).catch(
      (err: unknown) =>
        setPatchError(taskActionError('update', task.title, err)),
    );
  };

  const setStatus = (status: TaskStatus) => {
    if (status === task.status) return;
    // Complete and reopen go through the toggle, as the checkbox does.
    if (
      (status === 'done' && task.status === 'todo') ||
      (status === 'todo' && task.status === 'done')
    ) {
      void toggle(task);
      return;
    }
    patch({ status });
  };

  const start = taskScheduleLabel(task.startDate, today, task.someday);
  const error = patchError ?? toggleError ?? description.saveError;

  return (
    <>
      {renderEditor({
        value: description.value,
        onChange: description.onChange,
        label: `Details for ${task.title}`,
        placeholder: 'Add details…',
      })}
      <div className="task-details__chips">
        <select
          className="task-details__chip"
          aria-label="Status"
          value={task.status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <TaskDateButton
          kind="start"
          baseDay={today}
          clearLabel="No start date"
          hint="Shows up on Today from that date."
          className="task-details__chip"
          ariaLabel={`Start: ${start ?? 'none'}`}
          onChoose={(schedule) =>
            patch({ startDate: schedule.startDate, someday: schedule.someday })
          }
        >
          {start ? `Start ${start}` : 'Start'}
        </TaskDateButton>
        <TaskDateButton
          kind="due"
          baseDay={today}
          clearLabel="No deadline"
          hint="A deadline; it does not change when the task shows."
          className="task-details__chip"
          ariaLabel={`Due: ${task.dueDate ? formatTaskDay(task.dueDate) : 'none'}`}
          onChoose={(schedule) => patch({ dueDate: schedule.startDate })}
        >
          {task.dueDate ? `Due ${formatTaskDay(task.dueDate)}` : 'Due'}
        </TaskDateButton>
        <select
          className="task-details__chip"
          aria-label="Priority"
          value={task.priority}
          onChange={(e) => patch({ priority: e.target.value as TaskPriority })}
        >
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <TagsChip tags={task.tags} onChange={(tags) => patch({ tags })} />
        {moveMenu ? (
          <span className="task-details__move">
            <button
              type="button"
              className="task-details__chip"
              aria-expanded={moving}
              onClick={() => setMoving((v) => !v)}
            >
              Move to…
            </button>
            {moving ? moveMenu(() => setMoving(false)) : null}
          </span>
        ) : null}
        <span className="task-details__save">
          <SaveIndicator
            saveState={description.saveState}
            dirty={description.dirty}
          />
        </span>
      </div>
      {error ? (
        <p className="workspace-panel__error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
