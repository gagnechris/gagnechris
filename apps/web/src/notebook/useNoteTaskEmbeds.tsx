import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  taskActionError,
  useMoveTaskToDay,
  useNoteTaskEmbedSync,
  useTasksByIds,
  type EmbedNote,
  type Task,
} from '@gagnechris/app-core';
import type { Extension } from '@codemirror/state';
import {
  formatTaskDay,
  markdownPlainText,
  taskEmbedIds,
  taskEmbedNesting,
} from '@gagnechris/shared';
import {
  useTaskEmbedEditor,
  type TaskEmbedControls,
} from '../kit/markdown/taskEmbeds';
import { announceMove } from '../kit/markdown/taskEmbedMoves';
import {
  TaskEmbedRow,
  type TaskEmbedDetails,
  type TaskEmbedFinish,
  type TaskEmbedMoving,
  type TaskEmbedParentLabel,
  type TaskEmbedSubtasks,
  type TaskEmbedView,
} from '../kit/tasks/TaskEmbedRow';
import { PHONE_QUERY, useMediaQuery } from '../kit/useMediaQuery';
import {
  TaskDetailsPanel,
  type DescriptionEditorProps,
} from './TaskDetailsPanel';
import { FoldSync } from './FoldSync';
import { TaskMoveMenu } from './TaskMoveMenu';
import {
  toggleTaskDetails,
  toggleTaskFold,
  useTaskDetailsStore,
} from './taskDetailsStore';
import { useLocalToday } from './useLocalToday';

const firstLine = (markdown: string) =>
  markdownPlainText(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? null;

const NO_EXTENSIONS: Extension[] = [];

const isOpenStatus = (status: Task['status']) =>
  status === 'todo' || status === 'in_progress';

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

  const { open, peek, folded } = useTaskDetailsStore();
  const [finishing, setFinishing] = useState<string | null>(null);

  // Subtasks are the task lines directly under a top-level task line.
  const nesting = useMemo(() => {
    const placed = new Map<string, string | null>();
    const children = new Map<string, string[]>();
    for (const e of taskEmbedNesting(markdown)) {
      if (placed.has(e.id)) continue;
      placed.set(e.id, e.parentId);
      if (e.parentId) {
        children.set(e.parentId, [...(children.get(e.parentId) ?? []), e.id]);
      }
    }
    return { placed, children };
  }, [markdown]);

  const viewOf = (id: string): TaskEmbedView => {
    const state = stateOf(id);
    if (state.kind !== 'task') return state;
    const { saved, ...view } = state;
    if (!saved) return view;
    const subtasks = (nesting.children.get(id) ?? []).flatMap(
      (sub) => savedTask(sub) ?? [],
    );
    const onToggle =
      isOpenStatus(saved.status) &&
      subtasks.some((sub) => isOpenStatus(sub.status))
        ? () => {
            view.onToggle();
            setFinishing(id);
          }
        : view.onToggle;
    return { ...view, onToggle, to: `/tasks/${saved.id}` };
  };
  const peeking = note ? peek.has(note.id) : false;

  function savedTask(id: string): Task | undefined {
    const state = stateOf(id);
    return state.kind === 'task' ? state.saved : undefined;
  }

  // A subtask can sit apart from its parent, as when it carries in alone.
  const embedded = new Set(taskEmbedIds(markdown));
  const parentIds = [
    ...new Set(
      [...embedded].flatMap((id) => {
        const parentId = savedTask(id)?.parentId;
        return parentId && !embedded.has(parentId) ? [parentId] : [];
      }),
    ),
  ];
  const fetchedParents = useTasksByIds(parentIds);
  const parentLabelOf = (id: string): TaskEmbedParentLabel | undefined => {
    const parentId = savedTask(id)?.parentId;
    if (!parentId || nesting.placed.get(id) === parentId) return;
    const parent =
      savedTask(parentId) ??
      fetchedParents.find((p) => p.data?.id === parentId)?.data;
    if (!parent) return;
    return { title: parent.title, finished: !isOpenStatus(parent.status) };
  };

  const subtasksOf = (id: string): TaskEmbedSubtasks | undefined => {
    const children = (nesting.children.get(id) ?? []).flatMap(
      (sub) => savedTask(sub) ?? [],
    );
    const counted = children.filter((t) => t.status !== 'dropped');
    if (counted.length === 0) return;
    return {
      done: counted.filter((t) => t.status === 'done').length,
      total: counted.length,
      folded: folded.has(id),
      onToggleFold: () => toggleTaskFold(id),
    };
  };

  const finishOf = (id: string): TaskEmbedFinish | undefined => {
    if (finishing !== id) return;
    const state = stateOf(id);
    if (state.kind !== 'task' || state.saved?.status !== 'done') return;
    const openSubs = (nesting.children.get(id) ?? []).filter((sub) => {
      const s = stateOf(sub);
      return s.kind === 'task' && s.saved && isOpenStatus(s.saved.status);
    });
    if (openSubs.length === 0) return;
    return {
      open: openSubs.length,
      onCompleteAll: () => {
        for (const sub of openSubs) {
          const s = stateOf(sub);
          if (s.kind === 'task') s.onToggle();
        }
        setFinishing(null);
      },
      onJustParent: () => setFinishing(null),
      onUndo: () => {
        state.onToggle();
        setFinishing(null);
      },
    };
  };

  // Null once the editor is gone, or while it shows another note.
  const shownNoteId = useRef<string | null>(null);
  useEffect(() => {
    shownNoteId.current = note?.id ?? null;
    return () => {
      shownNoteId.current = null;
    };
  }, [note?.id]);

  const moveToDay = async (
    task: Task,
    controls: TaskEmbedControls,
    date: string,
  ) => {
    const block = controls.takeBlock();
    if (!note || !block) return;
    const fromNoteId = note.id;
    const shown = () => shownNoteId.current === fromNoteId;
    setMoveError(null);
    try {
      const moved = await moveTaskToDay({
        area: note.area,
        date,
        fromNoteId,
        task,
        readLines: () => (shown() ? block.lines() : null),
        removeLines: () => shown() && block.remove(),
      });
      if (!moved) return;
      announceMove(`Moved to ${formatTaskDay(date)}`);
      if (moved.patchError) {
        setMoveError(
          taskActionError('finish moving', task.title, moved.patchError),
        );
      }
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
      indent: controls.indent,
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

  const renderEmbed = (id: string, controls?: TaskEmbedControls) => {
    const subtasks = subtasksOf(id);
    return (
      <>
        {controls ? (
          <FoldSync fold={controls.fold} folded={!!subtasks?.folded} />
        ) : null}
        <TaskEmbedRow
          view={viewOf(id)}
          onLeave={controls?.leave}
          onEnter={controls?.enter}
          onDelete={controls?.remove}
          onMove={controls?.move}
          details={detailsOf(id, controls)}
          moving={phone ? undefined : movingOf(id, controls)}
          subtasks={subtasks}
          finish={finishOf(id)}
          parent={parentLabelOf(id)}
        />
      </>
    );
  };
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
