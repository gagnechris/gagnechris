import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  emptyTaskDraft,
  taskDraftFromTask,
  taskPayloadFromDraft,
  taskResource,
  useDeleteTaskMutation,
  useTaskToggle,
} from '@gagnechris/app-core';
import { snoozeBaseDay } from '@gagnechris/shared';
import { Field, Select, TextInput } from '../kit/Field';
import { SnoozeMenu } from '../kit/tasks/SnoozeMenu';
import { PHONE_QUERY, useMediaQuery } from '../kit/useMediaQuery';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import { LinkedNotePicker } from './LinkedNotePicker';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import { TaskMentions } from './TaskMentions';
import { useNotebookAreaName } from './useNotebookAreaName';
import { useLocalToday } from './useLocalToday';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
} from '../kit/tasks/taskOptions';

export default function NotebookTaskPage() {
  const areaName = useNotebookAreaName();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const today = useLocalToday();
  const phone = useMediaQuery(PHONE_QUERY);
  const deleteMutation = useDeleteTaskMutation();
  const {
    toggle: toggleTask,
    error: toggleError,
    pending: togglePending,
  } = useTaskToggle();

  const {
    draft,
    updateDraft,
    entity,
    saveError,
    loadError,
    isLoading,
    dirty,
    busy,
    saveState,
    runDelete,
  } = useWorkspaceDocEditor({
    resource: taskResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyTaskDraft(),
    toDraft: taskDraftFromTask,
    getEntityId: (task) => task.id,
    toPayload: (current) => taskPayloadFromDraft(current),
    conflictMessage:
      'Conflict — another device updated this task. Reload and try again.',
    conflictMessages: {
      deleted:
        'Another device deleted this task. Copy what you typed to keep it.',
    },
    loadErrorFallback: 'Could not load task.',
    delete: {
      confirm: 'Delete this task? It will disappear from your list.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: id, version });
      },
      onDeleted: () => {
        // Back to wherever the task was opened from; Tasks when it was the first page.
        if (location.key === 'default') void navigate('/tasks');
        else void navigate(-1);
      },
    },
  });

  if (loadError) {
    return (
      <section className="workspace-panel">
        <p className="workspace-panel__error" role="alert">
          {loadError}
        </p>
        <Link to="/tasks" className="workspace-back">
          ← Tasks
        </Link>
      </section>
    );
  }

  if (isLoading || !entity) {
    return (
      <section className="workspace-panel">
        <p>Loading task…</p>
      </section>
    );
  }

  const toggleDone = () => toggleTask(entity);

  return (
    <section className="workspace-panel workspace-panel--editor notebook-column">
      <div className="workspace-action-bar">
        <div className="workspace-action-bar__status">
          <Link to="/tasks" className="workspace-back">
            ← Tasks
          </Link>
          <SaveIndicator quiet saveState={saveState} dirty={dirty} />
        </div>
        <div className="workspace-toolbar">
          {phone ? null : (
            <button
              type="button"
              className="kit-btn"
              disabled={busy || dirty || togglePending}
              onClick={() => void toggleDone()}
              title={dirty ? 'Save before completing' : undefined}
            >
              {entity.status === 'done' ? 'Reopen' : 'Complete'}
            </button>
          )}
          <button
            type="button"
            className="kit-btn"
            disabled={busy}
            onClick={() => void runDelete()}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Phones: Complete and Snooze within thumb reach, above the tab bar. */}
      {phone ? (
        <div className="notebook-task__bottom-bar">
          <button
            type="button"
            className="kit-btn kit-btn--primary"
            disabled={busy || dirty || togglePending}
            onClick={() => void toggleDone()}
            title={dirty ? 'Save before completing' : undefined}
          >
            {entity.status === 'done' ? 'Reopen' : 'Complete'}
          </button>
          <SnoozeMenu
            label="Snooze"
            title={entity.title}
            baseDay={snoozeBaseDay(draft.startDate || today, today)}
            onChoose={(schedule) =>
              updateDraft((prev) => ({
                ...prev,
                startDate: schedule.startDate ?? '',
                someday: schedule.someday,
              }))
            }
          />
        </div>
      ) : null}

      {saveError ? (
        <p className="workspace-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}
      {toggleError ? (
        <p className="workspace-panel__error" role="alert">
          {toggleError}
        </p>
      ) : null}

      <h1 className="workspace-visually-hidden">
        {entity.title || 'Untitled task'}
      </h1>
      <p className="workspace-panel__lede">{areaName(entity.area)} task</p>

      <Field label="Title">
        <TextInput
          value={draft.title}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, title: e.target.value }))
          }
        />
      </Field>

      <Field label="Status">
        <Select
          value={draft.status}
          onChange={(e) =>
            updateDraft((prev) => ({
              ...prev,
              status: e.target.value as typeof prev.status,
            }))
          }
        >
          {TASK_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Priority">
        <Select
          value={draft.priority}
          onChange={(e) =>
            updateDraft((prev) => ({
              ...prev,
              priority: e.target.value as typeof prev.priority,
            }))
          }
        >
          {TASK_PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Show on" hint="Empty shows it on Today now.">
        <TextInput
          type="date"
          value={draft.startDate}
          disabled={draft.someday}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, startDate: e.target.value }))
          }
        />
      </Field>

      <label className="kit-check">
        <input
          type="checkbox"
          checked={draft.someday}
          onChange={(e) =>
            updateDraft((prev) => ({
              ...prev,
              someday: e.target.checked,
              startDate: e.target.checked ? '' : prev.startDate,
            }))
          }
        />
        Someday (never shows on Today)
      </label>

      <Field label="Deadline" hint="Doesn’t change when the task shows.">
        <TextInput
          type="date"
          value={draft.dueDate}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, dueDate: e.target.value }))
          }
        />
      </Field>

      <LinkedNotePicker
        value={draft.noteId}
        onChange={(noteId) => updateDraft((prev) => ({ ...prev, noteId }))}
      />

      <Field label="Tags (comma-separated)">
        <TextInput
          value={draft.tagsText}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, tagsText: e.target.value }))
          }
        />
      </Field>

      <NotebookMarkdownBody
        templates={{ date: today, areaName: areaName(entity.area) }}
        value={draft.description}
        onChange={(description) =>
          updateDraft((prev) => ({ ...prev, description }))
        }
      />

      <TaskMentions taskId={entity.id} homeNoteId={entity.noteId} />
    </section>
  );
}
