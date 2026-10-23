import { useState, type ReactNode } from 'react';
import {
  ApiError,
  taskActionError,
  usePatchTaskMutation,
  useTaskDescriptionEditor,
  useTaskToggle,
  type NotebookArea,
  type Task,
  type TaskPatch,
} from '@gagnechris/app-core';
import {
  deepEqual,
  formatTaskDay,
  parseTagsText,
  taskScheduleLabel,
  type TaskPriority,
  type TaskStatus,
} from '@gagnechris/shared';
import { Chip, ChipSelect, TextInput } from '@gagnechris/ui';
import { TaskDateButton } from '../kit/tasks/TaskDateButton';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useLocalToday } from './useLocalToday';
import { useNotebookAreaName } from './useNotebookAreaName';

const STATUS_OPTIONS: readonly { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
];

const PRIORITY_OPTIONS: readonly { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'High priority' },
  { value: 'med', label: 'Medium priority' },
  { value: 'low', label: 'Low priority' },
];

const staleCurrent = (err: unknown): Task | null => {
  if (!(err instanceof ApiError)) return null;
  const stale =
    err.status === 412 ||
    (err.status === 409 &&
      (err.error === undefined ||
        err.error === 'conflict' ||
        err.error === 'version_conflict'));
  const current = err.current as Task | undefined;
  return stale && current && !current.deleted ? current : null;
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
      <Chip
        aria-label={tags.length ? `Tags: ${tags.join(', ')}` : 'Add tags'}
        onClick={() => setEditing(tags.join(', '))}
      >
        {tags.length ? tags.map((t) => `#${t}`).join(' ') : 'Add tags'}
      </Chip>
    );
  }
  const commit = () => {
    const next = parseTagsText(editing);
    setEditing(null);
    if (next.join(',') !== tags.join(',')) onChange(next);
  };
  return (
    <TextInput
      size="sm"
      className="task-details__tags-input"
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
  templates: { date: string; area: NotebookArea; areaName: string };
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
  const areaName = useNotebookAreaName();
  const description = useTaskDescriptionEditor(task);
  const { mutateAsync: patchTask } = usePatchTaskMutation();
  const { toggle, error: toggleError } = useTaskToggle();
  const [patchError, setPatchError] = useState<string | null>(null);

  const patch = (changes: TaskPatch) => {
    setPatchError(null);
    const send = (version: number) =>
      patchTask({ id: task.id, version, patch: changes });
    send(task.version)
      .catch((err: unknown) => {
        // A newer version that leaves these fields as they were, such as a
        // description save, is safe to write on.
        const current = staleCurrent(err);
        const untouched =
          current &&
          (Object.keys(changes) as (keyof TaskPatch)[]).every((key) =>
            deepEqual(current[key], task[key]),
          );
        if (!untouched) throw err;
        return send(current.version);
      })
      .catch((err: unknown) =>
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
        templates: {
          date: today,
          area: task.area,
          areaName: areaName(task.area),
        },
      })}
      <div className="task-details__chips">
        <ChipSelect
          label="Status"
          options={STATUS_OPTIONS}
          value={task.status}
          onChange={setStatus}
        />
        <TaskDateButton
          kind="start"
          baseDay={today}
          clearLabel="No start date"
          hint="Shows up on Today from that date."
          onChoose={(schedule) =>
            patch({ startDate: schedule.startDate, someday: schedule.someday })
          }
          trigger={(props) => (
            <Chip {...props} aria-label={`Start: ${start ?? 'none'}`}>
              {start ? `Start ${start}` : 'Start'}
            </Chip>
          )}
        />
        <TaskDateButton
          kind="due"
          baseDay={today}
          clearLabel="No deadline"
          hint="A deadline; it does not change when the task shows."
          onChoose={(schedule) => patch({ dueDate: schedule.startDate })}
          trigger={(props) => (
            <Chip
              {...props}
              aria-label={`Due: ${task.dueDate ? formatTaskDay(task.dueDate) : 'none'}`}
            >
              {task.dueDate ? `Due ${formatTaskDay(task.dueDate)}` : 'Due'}
            </Chip>
          )}
        />
        <ChipSelect
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={task.priority}
          onChange={(priority) => patch({ priority })}
        />
        <TagsChip tags={task.tags} onChange={(tags) => patch({ tags })} />
        {moveMenu ? (
          <span className="task-details__move">
            <Chip aria-expanded={moving} onClick={() => setMoving((v) => !v)}>
              Move to…
            </Chip>
            {moving ? moveMenu(() => setMoving(false)) : null}
          </span>
        ) : null}
        <span className="task-details__save">
          <SaveIndicator
            quiet
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
