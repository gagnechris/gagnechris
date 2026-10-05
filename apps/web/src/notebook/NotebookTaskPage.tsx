import { Link, useNavigate, useParams } from 'react-router-dom';
import { taskResource, useDeleteTaskMutation } from '@gagnechris/app-core';
import { Field, Select, TextInput } from '../kit/Field';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useVersionedDocEditor } from '../workspace/useVersionedDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import { useTaskToggle } from './useTaskToggle';
import {
  emptyTaskDraft,
  taskDraftFromTask,
  taskPayloadFromDraft,
} from './taskDraft';

export default function NotebookTaskPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    save,
    saveError,
    loadError,
    isLoading,
    dirty,
    busy,
    saveState,
    runDelete,
  } = useVersionedDocEditor({
    resource: taskResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyTaskDraft(),
    toDraft: taskDraftFromTask,
    getEntityId: (task) => task.id,
    toPayload: (current) => taskPayloadFromDraft(current),
    conflictMessage:
      'Conflict — another device updated this task. Reload and try again.',
    loadErrorFallback: 'Could not load task.',
    delete: {
      confirm: 'Delete this task? It will disappear from your list.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: id, version });
      },
      onDeleted: () => {
        void navigate('/tasks');
      },
    },
  });

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
        <Link to="/tasks" className="admin-back">
          ← Tasks
        </Link>
      </section>
    );
  }

  if (isLoading || !entity) {
    return (
      <section className="admin-panel">
        <p>Loading task…</p>
      </section>
    );
  }

  const toggleDone = () => toggleTask(entity);

  return (
    <section className="admin-panel admin-panel--editor">
      <div className="admin-action-bar">
        <div className="admin-action-bar__status">
          <Link to="/tasks" className="admin-back">
            ← Tasks
          </Link>
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
          <button
            type="button"
            className="admin-btn"
            disabled={busy || dirty || togglePending}
            onClick={() => void toggleDone()}
            title={dirty ? 'Save before completing' : undefined}
          >
            {entity.status === 'done' ? 'Reopen' : 'Complete'}
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={busy}
            onClick={() => void runDelete()}
          >
            Delete
          </button>
        </div>
      </div>

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}
      {toggleError ? (
        <p className="admin-panel__error" role="alert">
          {toggleError}
        </p>
      ) : null}

      <p className="admin-panel__lede">
        {entity.area === 'work' ? 'Work' : 'Personal'} task
      </p>

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
          <option value="todo">Todo</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
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
          <option value="high">High</option>
          <option value="med">Med</option>
          <option value="low">Low</option>
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

      <label className="admin-check">
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

      <Field label="Linked note id (optional)">
        <TextInput
          value={draft.noteId}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, noteId: e.target.value }))
          }
          placeholder="ULID"
        />
      </Field>

      <Field label="Tags (comma-separated)">
        <TextInput
          value={draft.tagsText}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, tagsText: e.target.value }))
          }
        />
      </Field>

      <NotebookMarkdownBody
        value={draft.description}
        onChange={(description) =>
          updateDraft((prev) => ({ ...prev, description }))
        }
      />
    </section>
  );
}
