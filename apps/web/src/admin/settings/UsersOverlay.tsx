import type { FormEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../../kit/useModalDialog';

type Props = {
  kind: 'drawer' | 'dialog';
  label: string;
  onClose: () => void;
  /** Renders the panel as a form. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  panelRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/** The desktop users drawer or dialog; phones get a BottomSheet instead. */
export function UsersOverlay({
  kind,
  label,
  onClose,
  onSubmit,
  panelRef,
  children,
}: Props) {
  const { ref, dialogProps } = useModalDialog<HTMLElement>({
    label,
    onClose,
    lockScroll: true,
  });
  const panel = {
    ...dialogProps,
    ref: (el: HTMLElement | null) => {
      ref.current = el;
      if (panelRef) panelRef.current = el;
    },
    className: `users-${kind}`,
  };
  return createPortal(
    <div className={`users-overlay users-overlay--${kind}`}>
      <button
        type="button"
        className="users-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      {onSubmit ? (
        <form {...panel} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...panel}>{children}</div>
      )}
    </div>,
    document.body,
  );
}
