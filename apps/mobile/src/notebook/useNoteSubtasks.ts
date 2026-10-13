import {
  useLatest,
  useTasksByIds,
  type Task,
  type TaskEmbedState,
} from '@gagnechris/app-core';
import { taskEmbedNesting } from '@gagnechris/shared';
import { useMemo } from 'react';
import { Alert } from 'react-native';
import type { NoteSegment } from './noteSegments';
import { blockAt } from './taskBlockEdits';
import { toggleTaskFold, useTaskDetailsStore } from './taskDetailsStore';
import { isOpenStatus } from './taskParents';

export type Subtasks = {
  done: number;
  total: number;
  folded: boolean;
  onToggleFold: () => void;
};

/**
 * Subtasks are the task lines directly under a top-level task line, as on
 * the web: their counts, folding, the parent label of a subtask placed apart
 * from its parent, and the prompt when a parent is checked before them.
 */
export function useNoteSubtasks(
  markdown: string,
  stateOf: (id: string) => TaskEmbedState,
) {
  const { folded } = useTaskDetailsStore();
  // The prompt answers after the toggle re-rendered the rows.
  const current = useLatest(stateOf);
  const toggleNow = (id: string) => {
    const now = current.current(id);
    if (now.kind === 'task') now.onToggle();
  };

  const nesting = useMemo(() => {
    const placed = new Map<
      string,
      { parentId: string | null; depth: number }
    >();
    const lineOf = new Map<string, number>();
    const children = new Map<string, string[]>();
    for (const e of taskEmbedNesting(markdown)) {
      if (placed.has(e.id)) continue;
      placed.set(e.id, { parentId: e.parentId, depth: e.depth });
      lineOf.set(e.id, e.line);
      if (e.parentId) {
        children.set(e.parentId, [...(children.get(e.parentId) ?? []), e.id]);
      }
    }
    return { placed, lineOf, children };
  }, [markdown]);

  const savedTask = (id: string): Task | undefined => {
    const state = stateOf(id);
    return state.kind === 'task' ? state.saved : undefined;
  };

  // Lines under a folded parent, as [first, last] with the parent's line first.
  const foldedBlocks = useMemo(() => {
    const lines = markdown.split('\n');
    return [...nesting.children.keys()].flatMap((id) => {
      const line = nesting.lineOf.get(id);
      return folded.has(id) && line !== undefined ? [blockAt(lines, line)] : [];
    });
  }, [markdown, nesting, folded]);

  const hidden = (segment: NoteSegment) => {
    const first = segment.start;
    const last =
      segment.kind === 'embed'
        ? first
        : first + Math.max(segment.lines.length, 1) - 1;
    return foldedBlocks.some((b) => first > b.first && last <= b.last);
  };

  const subtasksOf = (id: string): Subtasks | undefined => {
    const counted = (nesting.children.get(id) ?? [])
      .flatMap((sub) => savedTask(sub) ?? [])
      .filter((t) => t.status !== 'dropped');
    if (counted.length === 0) return;
    return {
      done: counted.filter((t) => t.status === 'done').length,
      total: counted.length,
      folded: folded.has(id),
      onToggleFold: () => toggleTaskFold(id),
    };
  };

  // A subtask can sit apart from its parent, as when it carries in alone.
  const embedded = new Set(nesting.placed.keys());
  const parentIds = [
    ...new Set(
      [...embedded].flatMap((id) => {
        const parentId = savedTask(id)?.parentId;
        return parentId && !embedded.has(parentId) ? [parentId] : [];
      }),
    ),
  ];
  const fetchedParents = useTasksByIds(parentIds);

  const parentLabelOf = (id: string) => {
    const parentId = savedTask(id)?.parentId;
    if (!parentId || nesting.placed.get(id)?.parentId === parentId) return;
    const parent =
      savedTask(parentId) ??
      fetchedParents.find((p) => p.data?.id === parentId)?.data;
    if (!parent) return;
    return { title: parent.title, finished: !isOpenStatus(parent.status) };
  };

  /** The row's state, its checkbox asking about open subtasks first. */
  const withFinishPrompt = (id: string): TaskEmbedState => {
    const state = stateOf(id);
    if (state.kind !== 'task' || !state.saved) return state;
    const parent = state.saved;
    const open = (nesting.children.get(id) ?? []).filter((sub) => {
      const task = savedTask(sub);
      return task && isOpenStatus(task.status);
    });
    if (!isOpenStatus(parent.status) || open.length === 0) return state;
    return {
      ...state,
      onToggle: () => {
        state.onToggle();
        Alert.alert(
          `Finish ${parent.title}?`,
          open.length === 1
            ? '1 subtask is still open.'
            : `${open.length} subtasks are still open.`,
          [
            {
              text: 'Complete all',
              onPress: () => open.forEach(toggleNow),
            },
            { text: 'Just the parent' },
            { text: 'Undo', style: 'cancel', onPress: () => toggleNow(id) },
          ],
        );
      },
    };
  };

  const depthOf = (id: string) => nesting.placed.get(id)?.depth ?? 0;

  return { hidden, subtasksOf, parentLabelOf, withFinishPrompt, depthOf };
}
