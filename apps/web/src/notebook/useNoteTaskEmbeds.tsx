import type { ReactNode } from 'react';
import { useNoteTaskEmbedSync, type EmbedNote } from '@gagnechris/app-core';
import type { Extension } from '@codemirror/state';
import { markdownPlainText } from '@gagnechris/shared';
import {
  useTaskEmbedEditor,
  type TaskEmbedControls,
} from '../kit/markdown/taskEmbeds';
import {
  TaskEmbedRow,
  type TaskEmbedDetails,
  type TaskEmbedView,
} from '../kit/tasks/TaskEmbedRow';
import {
  TaskDetailsPanel,
  type DescriptionEditorProps,
} from './TaskDetailsPanel';
import { toggleTaskDetails, useTaskDetailsStore } from './taskDetailsStore';
import { useLocalToday } from './useLocalToday';

const firstLine = (markdown: string) =>
  markdownPlainText(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? null;

const NO_EXTENSIONS: Extension[] = [];

export function useNoteTaskEmbeds({
  markdown,
  note,
  ensureNoteSaved,
  removeEmbeds,
  retryDelaysMs,
  renderEditor,
}: {
  markdown: string;
  /** Null turns embeds off (task descriptions). */
  note: EmbedNote | null;
  /** Called before retrying a create the API rejected for a missing note. */
  ensureNoteSaved?: () => Promise<unknown>;
  /** Takes the lines of deleted tasks out of the note. */
  removeEmbeds?: (ids: ReadonlySet<string>) => void;
  retryDelaysMs?: readonly number[];
  /** The editor a task's open details use for its description. */
  renderEditor?: (props: DescriptionEditorProps) => ReactNode;
}) {
  const { onCreate, onRemoved, stateOf, error } = useNoteTaskEmbedSync({
    markdown,
    note,
    today: useLocalToday(),
    ensureNoteSaved,
    removeEmbeds,
    retryDelaysMs,
  });

  const viewOf = (id: string): TaskEmbedView => {
    const state = stateOf(id);
    if (state.kind !== 'task') return state;
    const { saved, ...view } = state;
    return saved ? { ...view, to: `/tasks/${saved.id}` } : view;
  };

  const { open, peek } = useTaskDetailsStore();
  const peeking = note ? peek.has(note.id) : false;

  const detailsOf = (id: string): TaskEmbedDetails | undefined => {
    const state = stateOf(id);
    if (state.kind !== 'task' || !state.saved || !renderEditor) return;
    const task = state.saved;
    const isOpen = open.has(id);
    return {
      open: isOpen,
      onToggle: () => toggleTaskDetails(id),
      hasDescription: task.description.trim() !== '',
      peek: peeking ? firstLine(task.description) : null,
      panel: isOpen ? (
        <TaskDetailsPanel task={task} renderEditor={renderEditor} />
      ) : null,
    };
  };

  const renderEmbed = (id: string, controls?: TaskEmbedControls) => (
    <TaskEmbedRow
      view={viewOf(id)}
      onLeave={controls?.leave}
      onDelete={controls?.remove}
      onMove={controls?.move}
      details={detailsOf(id)}
    />
  );
  const { extensions, portals } = useTaskEmbedEditor({
    onCreate,
    onRemove: onRemoved,
    renderEmbed,
  });

  if (!note) {
    return { extensions: NO_EXTENSIONS, portals: null, toggleError: null };
  }
  return { extensions, portals, renderEmbed, toggleError: error };
}
