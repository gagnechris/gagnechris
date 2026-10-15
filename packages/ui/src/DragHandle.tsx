/** @jsxRuntime automatic */
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from 'react';
import { assignRef, cx } from './cx.js';
import { Glyph } from './Glyph.js';

type Props = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  /** The item's name, read as "Reorder {item}". */
  item: string;
  /** Moves the item one place up (-1) or down (1). */
  onMove: (by: -1 | 1) => void;
  /** 1-based, with `count`, so moves are announced with a position. */
  position?: number;
  count?: number;
  onDrop?: () => void;
};

/**
 * A six-dot grip. Space picks the item up, arrows move it, Space or Escape
 * drops it, and each step is announced. Pointer dragging is the caller's: spread
 * its listeners onto the handle.
 */
export const DragHandle = ({
  item,
  onMove,
  position,
  count,
  onDrop,
  className,
  onKeyDown,
  onBlur,
  ref,
  ...rest
}: Props) => {
  const button = useRef<HTMLButtonElement | null>(null);
  const [grabbed, setGrabbed] = useState(false);
  const [message, setMessage] = useState('');
  const where = position && count ? ` position ${position} of ${count}` : '';

  useEffect(() => {
    if (!grabbed) return;
    button.current?.focus();
    // A reorder can remount or move the row; keep focus on the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const drop = () => {
    setGrabbed(false);
    setMessage(`Dropped ${item}${where ? ` at${where}` : ''}.`);
    onDrop?.();
  };

  const keyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (grabbed) drop();
      else {
        setGrabbed(true);
        setMessage(
          `Picked up ${item}${where ? `,${where}` : ''}. Use the arrow keys to move, Space to drop.`,
        );
      }
    } else if (grabbed && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      drop();
    } else if (grabbed && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const by = e.key === 'ArrowUp' ? -1 : 1;
      if (position && count) {
        const to = position + by;
        if (to < 1 || to > count) return;
        setMessage(`Moved ${item} to position ${to} of ${count}.`);
      } else {
        setMessage(`Moved ${item} ${by < 0 ? 'up' : 'down'}.`);
      }
      onMove(by);
    }
  };

  return (
    <>
      <button
        {...rest}
        ref={(el) => {
          button.current = el;
          assignRef(ref, el);
        }}
        type="button"
        aria-label={`Reorder ${item}`}
        aria-pressed={grabbed}
        className={cx(
          'ui-drag-handle',
          grabbed && 'ui-drag-handle--grabbed',
          className,
        )}
        onKeyDown={keyDown}
        onBlur={(e) => {
          // A reorder can move the focused node, which blurs it with no
          // relatedTarget; only a real focus move elsewhere drops the item.
          if (grabbed && e.relatedTarget) drop();
          onBlur?.(e);
        }}
      >
        <Glyph name="grip" size={16} />
      </button>
      <span className="ui-visually-hidden" role="status">
        {message}
      </span>
    </>
  );
};
