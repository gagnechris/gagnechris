import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

const STEP = 16;
// How far past the minimum a drag must go before it collapses the panel.
const COLLAPSE_PAST = 80;

type Props = {
  label: string;
  className: string;
  /** The element whose width the handle sets. */
  target: RefObject<HTMLElement | null>;
  width: number | null;
  min: number;
  max: number;
  /** Which edge of the target the handle sits on. */
  edge: 'left' | 'right';
  /** `live` while a drag moves; the drag's last width follows without it. */
  onChange: (width: number | null, live?: boolean) => void;
  /** Dragging well past the minimum, or shrinking from it by key, calls this. */
  onCollapse?: () => void;
};

/** A drag handle on a panel's edge; arrows nudge it, double-click resets it. */
export function ResizeHandle({
  label,
  className,
  target,
  width,
  min,
  max,
  edge,
  onChange,
  onCollapse,
}: Props) {
  const drag = useRef<{
    x: number;
    width: number;
    initial: number | null;
    last: number | null;
  } | null>(null);
  const sign = edge === 'right' ? 1 : -1;
  const current = () =>
    width ?? target.current?.getBoundingClientRect().width ?? min;
  // A focusable separator needs aria-valuenow, also while the CSS default
  // width applies.
  const [measured, setMeasured] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return;
    const measure = () => setMeasured(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);
  const now = Math.round(width ?? measured ?? min);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      width: current(),
      initial: width,
      last: null,
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const next = start.width + sign * (e.clientX - start.x);
    if (onCollapse && next < min - COLLAPSE_PAST) {
      drag.current = null;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      // Reopening shows the panel at the width it had before this drag.
      onChange(start.initial);
      onCollapse();
      return;
    }
    start.last = next;
    onChange(next, true);
  };
  const endDrag = () => {
    const last = drag.current?.last ?? null;
    drag.current = null;
    if (last !== null) onChange(last);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : null;
    if (dir === null) return;
    e.preventDefault();
    const next = current() + sign * dir * STEP;
    if (onCollapse && next < min && Math.round(current()) <= min) {
      onCollapse();
      return;
    }
    onChange(next);
  };

  return (
    <div
      className={`workspace-resize-handle ${className}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(min, now))}
      tabIndex={0}
      title={`${label}. Drag, or double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(null)}
      onKeyDown={onKeyDown}
    />
  );
}
