import { useRef, type PointerEvent } from 'react';

// Far enough that a click with a little hand movement still counts as a click.
const DRAG_TO_OPEN = 24;

type Props = {
  controls: string;
  openCount: number;
  onOpen: () => void;
};

/** The strip left on the right edge while the task panel is hidden. */
export const TodaySideRail = ({ controls, openCount, onOpen }: Props) => {
  const drag = useRef<{ x: number; opened: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, opened: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || start.opened) return;
    if (start.x - e.clientX < DRAG_TO_OPEN) return;
    start.opened = true;
    onOpen();
  };

  return (
    <div className="notebook-today__rail">
      <button
        type="button"
        className="notebook-today__rail-button"
        aria-controls={controls}
        aria-expanded={false}
        aria-label="Open the task panel"
        title="Show tasks. Click, or drag left"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          const start = drag.current;
          drag.current = null;
          if (!start?.opened) onOpen();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        // Keyboard and assistive tech clicks come without a pointer.
        onClick={(e) => {
          if (e.detail === 0) onOpen();
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M15 6l-6 6 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="notebook-today__rail-label">Tasks</span>
        {openCount > 0 ? (
          <span className="notebook-today__rail-count">{openCount}</span>
        ) : null}
      </button>
    </div>
  );
};
