import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { noteResource, useDeleteNoteMutation } from '@gagnechris/app-core';
import { Field, TextInput } from '../kit/Field';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import { NoteDetailsToggle, NoteMenu } from './NoteMenu';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from '@gagnechris/shared';
import { NOTEBOOK_AREA_LABELS } from './notebookAreaPreference';
import { noteHref } from './noteHref';

export default function NotebookNotePage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deleteMutation = useDeleteNoteMutation();

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
    resource: noteResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyNoteDraft(),
    toDraft: noteDraftFromNote,
    getEntityId: (note) => note.id,
    toPayload: (current) => notePayloadFromDraft(current),
    conflictMessage:
      'Conflict — another device updated this note. Reload and try again.',
    conflictMessages: {
      deleted:
        'Another device deleted this note. Copy what you typed to keep it.',
    },
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
      <section className="workspace-panel">
        <p className="workspace-panel__error" role="alert">
          {loadError}
        </p>
        <Link to="/notes" className="workspace-back">
          ← Notes
        </Link>
      </section>
    );
  }

  if (isLoading || !entity) {
    return (
      <section className="workspace-panel">
        <p>Loading note…</p>
      </section>
    );
  }

  // One editor per daily note: Today's, with its date and area.
  if (entity.type === 'daily' && entity.date) {
    return <Navigate to={noteHref(entity)} replace />;
  }

  return (
    <section className="workspace-panel workspace-panel--editor notebook-column">
      <div className="workspace-action-bar">
        <div className="workspace-action-bar__status">
          <Link to="/notes" className="workspace-back">
            ← Notes
          </Link>
          <SaveIndicator quiet saveState={saveState} dirty={dirty} />
        </div>
        <div className="workspace-toolbar">
          <NoteDetailsToggle markdown={draft.bodyMarkdown} />
          <NoteMenu
            noteId={entity.id}
            onDelete={() => void runDelete()}
            deleteDisabled={busy}
          />
        </div>
      </div>

      {saveError ? (
        <p className="workspace-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <h1 className="workspace-visually-hidden">
        {entity.title || 'Untitled page'}
      </h1>
      <p className="workspace-panel__lede">
        {NOTEBOOK_AREA_LABELS[entity.area]} page
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

      <label className="kit-check">
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
        note={entity}
        value={draft.bodyMarkdown}
        onChange={(bodyMarkdown) =>
          updateDraft((prev) => ({ ...prev, bodyMarkdown }))
        }
      />
    </section>
  );
}
