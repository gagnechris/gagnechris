import { useNoteTaskEmbedSync, type EmbedNote } from '@gagnechris/app-core';
import type { Extension } from '@codemirror/state';
import { useTaskEmbedEditor } from '../kit/markdown/taskEmbeds';
import {
  TaskEmbedRow,
  type TaskEmbedDelete,
  type TaskEmbedLeave,
  type TaskEmbedView,
} from '../kit/tasks/TaskEmbedRow';
import { useLocalToday } from './useLocalToday';

const NO_EXTENSIONS: Extension[] = [];

export function useNoteTaskEmbeds({
  markdown,
  note,
  ensureNoteSaved,
  removeEmbeds,
  retryDelaysMs,
}: {
  markdown: string;
  /** Null turns embeds off (task descriptions). */
  note: EmbedNote | null;
  /** Called before retrying a create the API rejected for a missing note. */
  ensureNoteSaved?: () => Promise<unknown>;
  /** Takes the lines of deleted tasks out of the note. */
  removeEmbeds?: (ids: ReadonlySet<string>) => void;
  retryDelaysMs?: readonly number[];
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

  const renderEmbed = (
    id: string,
    leave?: TaskEmbedLeave,
    remove?: TaskEmbedDelete,
  ) => <TaskEmbedRow view={viewOf(id)} onLeave={leave} onDelete={remove} />;
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
