import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

type Options = {
  /** The rows' ids, in the order `list`'s children show them. */
  ids: readonly string[];
  list: RefObject<HTMLElement | null>;
  /** Called as the pointer crosses into another row. */
  onMove: (from: number, to: number) => void;
  onDrop?: () => void;
};

/**
 * Pointer dragging for a list of `DragHandle` rows: spread `start(id)` onto
 * each handle's `onPointerDown`.
 */
export function useDragReorder({ ids, list, onMove, onDrop }: Options) {
  const [dragging, setDragging] = useState<string | null>(null);
  const latest = useRef({ ids, onMove, onDrop });
  useEffect(() => {
    latest.current = { ids, onMove, onDrop };
  });

  // Window listeners, not pointer capture: reordering moves the row's DOM
  // node, which drops capture mid-drag.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const from = latest.current.ids.indexOf(dragging);
      const to = [...(list.current?.children ?? [])].findIndex((row) => {
        const rect = row.getBoundingClientRect();
        return e.clientY >= rect.top && e.clientY < rect.bottom;
      });
      if (from >= 0 && to >= 0 && to !== from) latest.current.onMove(from, to);
    };
    const stop = () => {
      setDragging(null);
      latest.current.onDrop?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, list]);

  return {
    dragging,
    start: (id: string) => (e: ReactPointerEvent) => {
      e.preventDefault();
      setDragging(id);
    },
  };
}
