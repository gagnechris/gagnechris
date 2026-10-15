import { useRef } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  noteResource,
  useDeleteNoteMutation,
  type Note,
} from '@gagnechris/app-core';
import { Checkbox, Field, TextInput } from '@gagnechris/ui';
import type { MarkdownEditorHandle } from '../kit/markdown/MarkdownEditor';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import { NoteDetailsToggle, NoteMenu } from './NoteMenu';
import { useInsertNoteTemplate } from './noteTemplateMenu';
import { useLocalToday } from './useLocalToday';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
  type NoteDraft,
} from '@gagnechris/shared';
import { useNotebookAreaName } from './useNotebookAreaName';
import { noteHref } from './noteHref';

type StandingNoteDraft = NoteDraft & { archived: boolean };

const toDraft = (note: Note): StandingNoteDraft => ({
  ...noteDraftFromNote(note),
  archived: note.archived ?? false,
});

// Sent only when it changes, so editing an archived note keeps it archived.
const toPayload = (draft: StandingNoteDraft, note: Note) => ({
  ...notePayloadFromDraft(draft),
  archived:
    draft.archived === (note.archived ?? false) ? undefined : draft.archived,
});

export default function NotebookNotePage() {
  const areaName = useNotebookAreaName();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deleteMutation = useDeleteNoteMutation();
  const today = useLocalToday();
  const editorRef = useRef<MarkdownEditorHandle>(null);

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
    initialDraft: { ...emptyNoteDraft(), archived: false },
    toDraft,
    getEntityId: (note) => note.id,
    toPayload,
    conflictMessage:
      'Conflict — another device updated this note. Reload and try again.',
    conflictMessages: {
      deleted:
        'Another device deleted this note. Copy what you typed to keep it.',
    },
    loadErrorFallback: 'Could not load note.',
    delete: {
      confirm: 'Delete this note? It will disappear from your list.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: id, version });
      },
      onDeleted: () => {
        void navigate('/notes');
      },
    },
  });

  const insertTemplate = useInsertNoteTemplate(editorRef, {
    date: today,
    areaName: entity ? areaName(entity.area) : undefined,
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
            archived={draft.archived}
            onArchivedChange={(archived) =>
              updateDraft((prev) => ({ ...prev, archived }))
            }
            onDelete={() => void runDelete()}
            deleteDisabled={busy}
            onInsertTemplate={insertTemplate}
          />
        </div>
      </div>

      {saveError ? (
        <p className="workspace-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <h1 className="workspace-visually-hidden">
        {entity.title || 'Untitled note'}
      </h1>
      <p className="workspace-panel__lede">
        {areaName(entity.area)} standing note
        {draft.archived ? ' · Archived' : ''}
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

      <Checkbox
        className="notebook-check"
        label="Pinned"
        checked={draft.pinned}
        onChange={(e) =>
          updateDraft((prev) => ({ ...prev, pinned: e.target.checked }))
        }
      />

      <NotebookMarkdownBody
        editorRef={editorRef}
        templates={{ date: today, areaName: areaName(entity.area) }}
        note={entity}
        value={draft.bodyMarkdown}
        onChange={(bodyMarkdown) =>
          updateDraft((prev) => ({ ...prev, bodyMarkdown }))
        }
      />
    </section>
  );
}
