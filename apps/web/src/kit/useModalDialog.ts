import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

const focusables = (root: HTMLElement | null): HTMLElement[] =>
  root
    ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]'),
      )
    : [];

/**
 * A modal dialog: focus moves in on open (to `initialFocus`, or the first
 * focusable inside it, else the dialog's first focusable), Tab and Shift+Tab wrap inside, Escape calls `onClose`, and on
 * unmount focus returns to whatever had it before. Spread `dialogProps` on the
 * element that wraps everything the dialog shows, its backdrop included.
 */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>({
  label,
  onClose,
  initialFocus,
}: {
  label: string;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const returnTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const start = initialFocus?.current;
    const target =
      start && (start.tabIndex >= 0 ? start : focusables(start)[0]);
    (target ?? focusables(ref.current)[0] ?? ref.current)?.focus();
    return () => {
      if (returnTo?.isConnected) returnTo.focus();
    };
    // Mount and unmount only: refs are stable and focus moves once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<T>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(ref.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return {
    ref,
    dialogProps: {
      ref,
      role: 'dialog' as const,
      'aria-modal': true,
      'aria-label': label,
      tabIndex: -1,
      onKeyDown,
    },
  };
}
