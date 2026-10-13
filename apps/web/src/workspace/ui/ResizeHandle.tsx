import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

const STEP = 16;

type Props = {
  label: string;
  className: string;
  /** The element whose width the handle sets. */
  target: () => HTMLElement | null;
  width: number | null;
  min: number;
  max: number;
  /** Which edge of the target the handle sits on. */
  edge: 'left' | 'right';
  onChange: (width: number | null) => void;
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
}: Props) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const sign = edge === 'right' ? 1 : -1;
  const current = () => width ?? target()?.getBoundingClientRect().width ?? min;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width: current() };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    onChange(start.width + sign * (e.clientX - start.x));
  };
  const endDrag = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : null;
    if (dir === null) return;
    e.preventDefault();
    onChange(current() + sign * dir * STEP);
  };

  return (
    <div
      className={`workspace-resize-handle ${className}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width ?? undefined}
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
