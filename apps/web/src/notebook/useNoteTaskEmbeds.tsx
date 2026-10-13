import { useState, type ReactNode } from 'react';
import {
  taskActionError,
  useMoveTaskToDay,
  useNoteTaskEmbedSync,
  type EmbedNote,
  type Task,
} from '@gagnechris/app-core';
import type { Extension } from '@codemirror/state';
import {
  formatTaskDay,
  markdownPlainText,
  taskEmbedIds,
} from '@gagnechris/shared';
import {
  useTaskEmbedEditor,
  type TaskEmbedControls,
} from '../kit/markdown/taskEmbeds';
import { announceMove } from '../kit/markdown/taskEmbedMoves';
import {
  TaskEmbedRow,
  type TaskEmbedDetails,
  type TaskEmbedMoving,
  type TaskEmbedView,
} from '../kit/tasks/TaskEmbedRow';
import { PHONE_QUERY, useMediaQuery } from '../kit/useMediaQuery';
import {
  TaskDetailsPanel,
  type DescriptionEditorProps,
} from './TaskDetailsPanel';
import { TaskMoveMenu } from './TaskMoveMenu';
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
  const today = useLocalToday();
  const phone = useMediaQuery(PHONE_QUERY);
  const moveTaskToDay = useMoveTaskToDay();
  const [moveError, setMoveError] = useState<string | null>(null);
  const { onCreate, onRemoved, stateOf, error } = useNoteTaskEmbedSync({
    markdown,
    note,
    today,
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

  const savedTask = (id: string): Task | undefined => {
    const state = stateOf(id);
    return state.kind === 'task' ? state.saved : undefined;
  };

  const moveToDay = async (
    task: Task,
    controls: TaskEmbedControls,
    date: string,
  ) => {
    const block = controls.takeBlock();
    if (!note || !block) return;
    setMoveError(null);
    const subtasks = taskEmbedIds(block.lines)
      .slice(1)
      .flatMap((sub) => savedTask(sub) ?? []);
    try {
      await moveTaskToDay({
        area: note.area,
        date,
        lines: block.lines,
        fromNoteId: note.id,
        task,
        subtasks,
      });
      block.remove();
      announceMove(`Moved to ${formatTaskDay(date)}`);
    } catch (err) {
      setMoveError(taskActionError('move', task.title, err));
    }
  };

  const moveMenu =
    (task: Task, controls: TaskEmbedControls) => (close: () => void) => (
      <TaskMoveMenu
        sections={controls.sections()}
        today={today}
        noteDate={note?.date}
        onSection={(index) => {
          close();
          controls.toSection(index);
        }}
        onDay={(date) => {
          close();
          void moveToDay(task, controls, date);
        }}
        onClose={close}
      />
    );

  const movingOf = (
    id: string,
    controls?: TaskEmbedControls,
  ): TaskEmbedMoving | undefined => {
    const task = savedTask(id);
    if (!task || !controls) return;
    return {
      shift: controls.shift,
      drag: controls.drag,
      menu: moveMenu(task, controls),
    };
  };

  const detailsOf = (
    id: string,
    controls?: TaskEmbedControls,
  ): TaskEmbedDetails | undefined => {
    const task = savedTask(id);
    if (!task || !renderEditor) return;
    const isOpen = open.has(id);
    return {
      open: isOpen,
      onToggle: () => toggleTaskDetails(id),
      hasDescription: task.description.trim() !== '',
      peek: peeking ? firstLine(task.description) : null,
      panel: isOpen ? (
        <TaskDetailsPanel
          task={task}
          renderEditor={renderEditor}
          moveMenu={controls ? moveMenu(task, controls) : undefined}
        />
      ) : null,
    };
  };

  const renderEmbed = (id: string, controls?: TaskEmbedControls) => (
    <TaskEmbedRow
      view={viewOf(id)}
      onLeave={controls?.leave}
      onDelete={controls?.remove}
      onMove={controls?.move}
      details={detailsOf(id, controls)}
      moving={phone ? undefined : movingOf(id, controls)}
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
  return { extensions, portals, renderEmbed, toggleError: error ?? moveError };
}
