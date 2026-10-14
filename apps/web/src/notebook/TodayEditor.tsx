import { useEffect, useRef, type MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  dailyNoteResource,
  isTemplateStartedDaily,
  startDailyNoteBlank,
  useDeleteNoteMutation,
  useReportEmbeddedIds,
  type NotebookArea,
} from '@gagnechris/app-core';
import {
  emptyNoteDraft,
  formatCalendarDay,
  noteDraftFromNote,
  notePayloadFromDraft,
  taskEmbedToken,
} from '@gagnechris/shared';
import type { MarkdownEditorHandle } from '../kit/markdown/MarkdownEditor';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import { NoteDetailsToggle, NoteMenu } from './NoteMenu';
import { useInsertNoteTemplate } from './noteTemplateMenu';
import {
  NOTEBOOK_AREA_HEADINGS,
  NOTEBOOK_AREA_LABELS,
} from './notebookAreaPreference';

function dayHeading(date: string, today: string): string {
  return formatCalendarDay(date, {
    weekday: 'long',
    month: 'long',
    year: date.slice(0, 4) !== today.slice(0, 4),
  });
}

export function DayTitle({
  area,
  date,
  today,
}: {
  area: NotebookArea | null;
  date: string;
  today: string;
}) {
  const areaLabel = NOTEBOOK_AREA_HEADINGS[area ?? 'all'];
  return (
    <div className="notebook-today__title">
      <p className="notebook-today__kicker">
        {areaLabel}
        {date === today ? ' · Today' : ''}
      </p>
      <h1>{dayHeading(date, today)}</h1>
    </div>
  );
}

export function TodayEditor({
  area,
  date,
  today,
  onUnsavedChange,
  onEmbeddedIds,
  appendEmbedRef,
  onNoteReady,
  highlightTaskId,
  onHighlighted,
  onDeleted,
}: {
  area: NotebookArea;
  date: string;
  today: string;
  onUnsavedChange: (unsaved: boolean) => void;
  /** The draft's embeds, which are what the note shows; null while loading. */
  onEmbeddedIds: (ids: ReadonlySet<string> | null) => void;
  /** Set while the note can take a new embed line. */
  appendEmbedRef: MutableRefObject<((taskId: string) => void) | null>;
  onNoteReady: (ready: boolean) => void;
  highlightTaskId: string | null;
  onHighlighted: () => void;
  onDeleted: () => void;
}) {
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
    saveState,
    replaceFromEntity,
    busy,
    runDelete,
  } = useWorkspaceDocEditor({
    resource: dailyNoteResource,
    params: { area, date, carryIn: date === today },
    initialDraft: emptyNoteDraft(),
    toDraft: noteDraftFromNote,
    getEntityId: (note) => `${note.area}:${note.date}:${note.id}`,
    toPayload: (current, note) => ({
      id: note.id,
      ...notePayloadFromDraft(current),
    }),
    conflictMessage:
      'Conflict — another device updated this daily note. Reload and try again.',
    conflictMessages: {
      // A placeholder save that lost the race to create this day.
      daily_taken:
        'Another tab or device already started this daily note. Copy what you typed, then reload to open it.',
    },
    loadErrorFallback: 'Could not load daily note.',
    delete: {
      confirm:
        'Delete this daily note? Its tasks stay in your list; the day starts empty.',
      mutate: async (version) => {
        if (entity)
          await deleteMutation.mutateAsync({ id: entity.id, version });
      },
      onDeleted,
    },
  });

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const insertTemplate = useInsertNoteTemplate(editorRef, { date, area });

  const unsaved = dirty || saveState === 'saving';
  useEffect(() => {
    onUnsavedChange(unsaved);
  }, [onUnsavedChange, unsaved]);

  const ready = !loadError && !isLoading && entity !== undefined;
  useReportEmbeddedIds(ready ? draft.bodyMarkdown : null, onEmbeddedIds);

  useEffect(() => {
    if (!ready) return;
    appendEmbedRef.current = (taskId) =>
      updateDraft((prev) => ({
        ...prev,
        bodyMarkdown: appendTaskEmbed(prev.bodyMarkdown, taskId),
      }));
    onNoteReady(true);
    return () => {
      appendEmbedRef.current = null;
      onNoteReady(false);
    };
  }, [appendEmbedRef, onNoteReady, ready, updateDraft]);

  if (loadError || isLoading || !entity) {
    return (
      <>
        <div className="workspace-action-bar notebook-today__header">
          <DayTitle area={area} date={date} today={today} />
        </div>
        {loadError ? (
          <p className="workspace-panel__error" role="alert">
            {loadError}
          </p>
        ) : (
          <p>Loading daily note…</p>
        )}
      </>
    );
  }

  return (
    <>
      <div className="workspace-action-bar notebook-today__header">
        <DayTitle area={area} date={date} today={today} />
        <div className="workspace-action-bar__status">
          <SaveIndicator
            quiet
            saveState={saveState}
            dirty={dirty}
            isNew={entity.version === 0}
          />
        </div>
        <div className="workspace-toolbar">
          <NoteDetailsToggle markdown={draft.bodyMarkdown} />
          <NoteMenu
            noteId={entity.id}
            onDelete={entity.version > 0 ? () => void runDelete() : undefined}
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
      {isTemplateStartedDaily(entity) && !dirty && saveState !== 'saving' ? (
        <div className="notebook-today__template" role="note">
          <span>
            Started from your <strong>{NOTEBOOK_AREA_LABELS[area]}</strong>{' '}
            template. It’s saved as soon as you type.
          </span>
          <span className="notebook-today__template-actions">
            <button
              type="button"
              className="notebook-today__template-action"
              onClick={() => replaceFromEntity(startDailyNoteBlank(entity))}
            >
              Start blank
            </button>
            <Link
              className="notebook-today__template-action"
              to={`/settings/templates?template=${area}&area=${area}`}
            >
              Edit template
            </Link>
          </span>
        </div>
      ) : null}
      <NotebookMarkdownBody
        editorRef={editorRef}
        templates={{ date, area }}
        note={entity}
        ensureNoteSaved={save}
        value={draft.bodyMarkdown}
        onChange={(bodyMarkdown) =>
          updateDraft((prev) => ({ ...prev, bodyMarkdown }))
        }
        highlightTaskId={highlightTaskId}
        onHighlighted={onHighlighted}
      />
    </>
  );
}

/** The embed, then an empty line for the context written under it. */
function appendTaskEmbed(markdown: string, taskId: string): string {
  const body = markdown.replace(/\s+$/, '');
  return `${body}${body ? '\n\n' : ''}${taskEmbedToken(taskId)}\n\n`;
}
