import { Link, useNavigate, useParams } from 'react-router-dom';
import { noteResource, useDeleteNoteMutation } from '@gagnechris/app-core';
import { Field, TextInput } from '../kit/Field';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useVersionedDocEditor } from '../workspace/useVersionedDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from './noteDraft';

export default function NotebookNotePage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deleteMutation = useDeleteNoteMutation();

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
    resource: noteResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyNoteDraft(),
    toDraft: noteDraftFromNote,
    getEntityId: (note) => note.id,
    toPayload: (current) => notePayloadFromDraft(current),
    conflictMessage:
      'Conflict — another device updated this note. Reload and try again.',
    loadErrorFallback: 'Could not load note.',
    delete: {
      confirm: 'Delete this page? It will disappear from your list.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: id, version });
      },
      onDeleted: () => {
        void navigate('/notes');
      },
    },
  });

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
        <Link to="/notes" className="admin-back">
          ← Notes
        </Link>
      </section>
    );
  }

  if (isLoading || !entity) {
    return (
      <section className="admin-panel">
        <p>Loading note…</p>
      </section>
    );
  }

  return (
    <section className="admin-panel admin-panel--editor">
      <div className="admin-action-bar">
        <div className="admin-action-bar__status">
          <Link to="/notes" className="admin-back">
            ← Notes
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

      <p className="admin-panel__lede">
        {entity.area === 'work' ? 'Work' : 'Personal'} page
      </p>

      <Field label="Title">
        <TextInput
          value={draft.title}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, title: e.target.value }))
          }
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

      <label className="admin-check">
        <input
          type="checkbox"
          checked={draft.pinned}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, pinned: e.target.checked }))
          }
        />
        Pinned
      </label>

      <NotebookMarkdownBody
        value={draft.bodyMarkdown}
        onChange={(bodyMarkdown) =>
          updateDraft((prev) => ({ ...prev, bodyMarkdown }))
        }
      />
    </section>
  );
}
