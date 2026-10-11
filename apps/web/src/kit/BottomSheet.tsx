import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from './useModalDialog';
import './bottomSheet.css';

const DISMISS_PX = 80;

type Props = {
  title: string;
  /** The dialog's name, when it should say more than the title. */
  label?: string;
  onClose: () => void;
  /** Replaces the Done button, which only closes the sheet. */
  done?: ReactNode;
  children: ReactNode;
};

/** A phone bottom sheet: grabber, Close / title / Done, and the safe area. */
export function BottomSheet({
  title,
  label = title,
  onClose,
  done,
  children,
}: Props) {
  const [dragY, setDragY] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const { ref, dialogProps } = useModalDialog<HTMLElement>({
    label,
    onClose,
  });

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [ref]);

  const grab = {
    onPointerDown: (e: PointerEvent) => {
      dragFrom.current = e.clientY;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragFrom.current === null) return;
      setDragY(Math.max(0, e.clientY - dragFrom.current));
    },
    onPointerUp: () => {
      const pulled = dragY;
      dragFrom.current = null;
      setDragY(0);
      if (pulled > DISMISS_PX) onClose();
    },
    onPointerCancel: () => {
      dragFrom.current = null;
      setDragY(0);
    },
  };

  return createPortal(
    <div className="bottom-sheet">
      <div className="bottom-sheet__scrim" onClick={onClose} />
      <section
        {...dialogProps}
        className="bottom-sheet__panel"
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div className="bottom-sheet__grab" {...grab}>
          <span className="bottom-sheet__handle" aria-hidden="true" />
        </div>
        <div className="bottom-sheet__head">
          <button
            type="button"
            className="bottom-sheet__button"
            onClick={onClose}
          >
            Close
          </button>
          <h2 className="bottom-sheet__title">{title}</h2>
          {done ?? (
            <button
              type="button"
              className="bottom-sheet__button bottom-sheet__button--done"
              onClick={onClose}
            >
              Done
            </button>
          )}
        </div>
        <div className="bottom-sheet__body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
