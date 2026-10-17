import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  errorMessage,
  noteTemplateResource,
  useCreateNoteTemplateMutation,
  useDeleteNoteTemplateMutation,
  useNoteTemplatesQuery,
  type NoteTemplate,
} from '@gagnechris/app-core';
import {
  compareNoteTemplates,
  DAILY_TEMPLATE_DATE_TOKEN,
  NOTE_TEMPLATE_NAME_MAX_LENGTH,
} from '@gagnechris/shared';
import {
  Button,
  EmptyState,
  Field,
  List,
  ListRow,
  TextInput,
} from '@gagnechris/ui';
import type { MarkdownEditorHandle } from '../kit/markdown/MarkdownEditor';
import { createUlid } from '../lib/ulid';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import ShellIcon from '../workspace/ui/ShellIcon';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';

type Draft = { name: string; bodyMarkdown: string };

const INITIAL_DRAFT: Draft = { name: '', bodyMarkdown: '' };

const MARKDOWN_PREFIX = /^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]?\]\s+)?|\[ \]\s+)/;

function templateSummary(bodyMarkdown: string): string {
  const line = bodyMarkdown
    .split('\n')
    .map((l) => l.replace(MARKDOWN_PREFIX, '').trim())
    .find(Boolean);
  return line ?? 'Empty';
}

function TemplateEditor({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted: () => void;
}) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const remove = useDeleteNoteTemplateMutation();
  const editor = useWorkspaceDocEditor({
    resource: noteTemplateResource,
    params: { id },
    initialDraft: INITIAL_DRAFT,
    toDraft: (template): Draft => ({
      name: template.name,
      bodyMarkdown: template.bodyMarkdown,
    }),
    getEntityId: (template) => template.id,
    // A blank name is never saved; the last one stays until it is filled in.
    toPayload: (draft, template) => ({
      name: draft.name.trim() || template.name,
      bodyMarkdown: draft.bodyMarkdown,
    }),
    conflictMessage:
      'Another device changed this template. Reload to see its version.',
    loadErrorFallback: 'Could not load the template.',
    delete: {
      confirm:
        'Delete this template? Notes it was inserted into keep its text.',
      mutate: async (version) => {
        await remove.mutateAsync({ id, version });
      },
      onDeleted,
    },
  });
  const { draft, updateDraft, entity, dirty, saveState, busy, runDelete } =
    editor;

  if (editor.loadError || editor.isLoading || !entity) {
    return editor.loadError ? (
      <p className="workspace-panel__error" role="alert">
        {editor.loadError}
      </p>
    ) : (
      <p>Loading template…</p>
    );
  }

  const insertDate = () => {
    const handle = editorRef.current;
    if (handle?.view()) {
      handle.insertText(DAILY_TEMPLATE_DATE_TOKEN);
      handle.focus();
    } else {
      updateDraft((current) => ({
        ...current,
        bodyMarkdown: `${current.bodyMarkdown}${DAILY_TEMPLATE_DATE_TOKEN}`,
      }));
    }
  };

  return (
    <section
      className="note-templates__editor"
      aria-label={`${entity.name} template`}
    >
      <div className="notebook-templates__bar">
        <h2>{entity.name}</h2>
        <div className="notebook-templates__actions">
          <SaveIndicator quiet saveState={saveState} dirty={dirty} />
          <Button onClick={insertDate}>Insert date</Button>
          <Button disabled={busy} onClick={() => void runDelete()}>
            Delete
          </Button>
        </div>
      </div>
      {editor.saveError ? (
        <p className="workspace-panel__error" role="alert">
          {editor.saveError}
        </p>
      ) : null}
      <Field
        label="Name"
        hint={draft.name.trim() === '' ? 'A template needs a name.' : undefined}
      >
        <TextInput
          value={draft.name}
          maxLength={NOTE_TEMPLATE_NAME_MAX_LENGTH}
          onChange={(e) =>
            updateDraft((current) => ({ ...current, name: e.target.value }))
          }
        />
      </Field>
      <NotebookMarkdownBody
        editorRef={editorRef}
        value={draft.bodyMarkdown}
        onChange={(bodyMarkdown) =>
          updateDraft((current) => ({ ...current, bodyMarkdown }))
        }
        label="Template text"
        placeholder="Write what this template inserts…"
      />
      <p className="kit-hint">
        Task lines (<code>[ ] text</code>) become tasks in the note you insert
        the template into. <code>{'{{date}}'}</code>,{' '}
        <code>{'{{weekday}}'}</code> and <code>{'{{area}}'}</code> are filled in
        then.
      </p>
    </section>
  );
}

function NewTemplateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateNoteTemplateMutation();
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { id: createUlid(), name: trimmed, bodyMarkdown: '' },
      {
        onSuccess: (template) => {
          setName('');
          onCreated(template.id);
        },
      },
    );
  };

  return (
    <form className="note-templates__new" onSubmit={submit}>
      <Field label="New template">
        <TextInput
          value={name}
          maxLength={NOTE_TEMPLATE_NAME_MAX_LENGTH}
          placeholder="Name, like HM Screen Interview"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        variant="primary"
        disabled={!name.trim() || create.isPending}
      >
        Create
      </Button>
      {create.error ? (
        <p className="workspace-panel__error" role="alert">
          {errorMessage(create.error, 'Could not create the template.')}
        </p>
      ) : null}
    </form>
  );
}

function TemplateList({
  templates,
  selected,
  onSelect,
}: {
  templates: readonly NoteTemplate[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (templates.length === 0) return null;
  return (
    <List aria-label="Templates">
      {[...templates].sort(compareNoteTemplates).map((template) => (
        <ListRow
          key={template.id}
          title={template.name}
          meta={templateSummary(template.bodyMarkdown)}
          current={template.id === selected}
          onClick={() => onSelect(template.id)}
        />
      ))}
    </List>
  );
}

export default function NotebookNoteTemplatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const templates = useNoteTemplatesQuery();
  const fromUrl = searchParams.get('template');
  const list = templates.data ?? [];
  const selected = list.some((t) => t.id === fromUrl) ? fromUrl : null;

  const select = (id: string | null) =>
    setSearchParams(
      (params) => {
        if (id) params.set('template', id);
        else params.delete('template');
        return params;
      },
      { replace: true },
    );

  return (
    <section className="workspace-panel workspace-panel--editor">
      <div className="workspace-action-bar">
        <div className="notebook-today__title">
          <p className="notebook-today__kicker">Settings</p>
          <h1>Note templates</h1>
        </div>
      </div>
      <p className="workspace-panel__lede">
        Text you reuse, like an interview outline. Type <code>/</code> at the
        start of a line in a note or task page, or use Insert template… in a
        note’s ⋯ menu.
      </p>
      {templates.error ? (
        <p className="workspace-panel__error" role="alert">
          {errorMessage(templates.error, 'Could not load templates.')}
        </p>
      ) : templates.isPending ? (
        <p>Loading templates…</p>
      ) : (
        <div className="note-templates">
          <div className="note-templates__side">
            <TemplateList
              templates={list}
              selected={selected}
              onSelect={select}
            />
            <NewTemplateForm onCreated={select} />
          </div>
          {selected ? (
            <TemplateEditor
              key={selected}
              id={selected}
              onDeleted={() => select(null)}
            />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<ShellIcon name="templates" size={32} />}
              title="No templates yet"
            >
              Name one under New template to start.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<ShellIcon name="templates" size={32} />}
              title="Choose a template"
            >
              Pick one from the list to edit its text.
            </EmptyState>
          )}
        </div>
      )}
    </section>
  );
}
