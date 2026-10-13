import { useLatest } from '@gagnechris/app-core';
import { taskEmbedIds } from '@gagnechris/shared';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent } from 'react-native';
import { useDragScroll } from '../ui/DragScroll';
import type { DragMove } from '../ui/DragGrip';
import type { NoteSegment } from './noteSegments';
import {
  indentTaskBlock,
  moveTaskBlock,
  taskBlockLines,
} from './taskBlockEdits';

type Frame = { y: number; height: number };
type Target = { before: string } | { after: string };

export type RowDrag = {
  key: string;
  id: string;
  target: Target | null;
  /** Where the drop line is drawn, in the editor's coordinates. */
  lineY: number | null;
  level: 'in' | 'out' | null;
};

/** How far sideways a drag nests or un-nests, as on the web. */
const SIDEWAYS = 28;

/**
 * Drags a task row by its grip: the row follows the finger, a line shows
 * where its block lands among the other rows, sideways nests or un-nests,
 * and the drop is one change to the markdown.
 */
export function useRowDrag({
  markdown,
  segments,
  visible,
  onChange,
}: {
  markdown: () => string;
  segments: readonly NoteSegment[];
  visible: (segment: NoteSegment) => boolean;
  onChange: (markdown: string) => void;
}) {
  const scroll = useDragScroll();
  const frames = useRef(new Map<string, Frame>());
  const [dy] = useState(() => new Animated.Value(0));
  const [drag, setDrag] = useState<RowDrag | null>(null);
  const startOffset = useRef(0);
  const current = useRef<RowDrag | null>(null);
  const latest = useLatest({ segments, visible });

  const set = (next: RowDrag | null) => {
    const prev = current.current;
    current.current = next;
    const same =
      prev &&
      next &&
      prev.lineY === next.lineY &&
      prev.level === next.level &&
      JSON.stringify(prev.target) === JSON.stringify(next.target);
    if (!same) setDrag(next);
  };

  const onLayout = (key: string) => (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    frames.current.set(key, { y, height });
  };

  const targetOf = (key: string, id: string, offsetY: number) => {
    const own = frames.current.get(key);
    if (!own) return { target: null, lineY: null };
    const carried = new Set(taskEmbedIds(taskBlockLines(markdown(), id) ?? ''));
    let passedOwn = false;
    const rows = latest.current.segments.flatMap((s) => {
      if (s.key === key) passedOwn = true;
      if (s.kind !== 'embed' || carried.has(s.id)) return [];
      if (!latest.current.visible(s)) return [];
      const frame = frames.current.get(s.key);
      return frame ? [{ id: s.id, afterOwn: passedOwn, ...frame }] : [];
    });
    const center = own.y + own.height / 2 + offsetY;
    const below = rows.find((r) => r.y + r.height / 2 > center);
    // Dropped where it already is: no move, even across text or a heading.
    if (
      below ? below === rows.find((r) => r.afterOwn) : !rows.at(-1)?.afterOwn
    ) {
      return { target: null, lineY: null };
    }
    if (below) return { target: { before: below.id }, lineY: below.y };
    const last = rows.at(-1);
    return last
      ? { target: { after: last.id }, lineY: last.y + last.height }
      : { target: null, lineY: null };
  };

  const handlers = (key: string, id: string) => ({
    onStart: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      startOffset.current = scroll?.offset() ?? 0;
      scroll?.setLocked(true);
      dy.setValue(0);
      set({ key, id, target: null, lineY: null, level: null });
    },
    onMove: (move: DragMove) => {
      // The content scrolls under the finger near the edges; the row stays on it.
      const offsetY = move.dy + (scroll?.offset() ?? 0) - startOffset.current;
      dy.setValue(offsetY);
      scroll?.edgeScroll(move.pageY);
      set({
        key,
        id,
        ...targetOf(key, id, offsetY),
        level: move.dx > SIDEWAYS ? 'in' : move.dx < -SIDEWAYS ? 'out' : null,
      });
    },
    onEnd: (move: DragMove | null) => {
      scroll?.edgeScroll(null);
      scroll?.setLocked(false);
      const done = current.current;
      set(null);
      dy.setValue(0);
      if (!move || !done) return;
      const before = markdown();
      let next = done.target ? moveTaskBlock(before, id, done.target) : null;
      if (done.level) {
        next = indentTaskBlock(next ?? before, id, done.level) ?? next;
      }
      if (next !== null && next !== before) onChange(next);
    },
  });

  return { drag, dy, onLayout, handlers };
}
