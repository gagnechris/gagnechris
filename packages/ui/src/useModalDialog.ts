import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

const focusables = (root: HTMLElement | null): HTMLElement[] =>
  root
    ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]'),
      )
    : [];

const openDialogs: RefObject<HTMLElement | null>[] = [];

/**
 * A modal dialog: focus moves in on open (to `initialFocus`, or the first
 * focusable inside it, else a `[data-autofocus]` element, else the dialog's
 * first focusable), Tab and Shift+Tab wrap inside, Escape calls `onClose`, and
 * on unmount focus returns to whatever had it before. Spread `dialogProps` on
 * the element that wraps everything the dialog shows, its backdrop included.
 */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>({
  label,
  onClose,
  initialFocus,
  lockScroll = false,
}: {
  label: string;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  lockScroll?: boolean;
}) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // An action that disables or removes the focused control drops focus to
  // <body>, out of reach of the dialog's own key handler; the topmost dialog
  // still takes Escape and Tab from there.
  useEffect(() => {
    openDialogs.push(ref);
    const onDocumentKeyDown = (e: globalThis.KeyboardEvent) => {
      const dialog = ref.current;
      if (
        e.defaultPrevented ||
        openDialogs[openDialogs.length - 1] !== ref ||
        !dialog
      )
        return;
      if (dialog.contains(document.activeElement)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const items = focusables(dialog);
        items[e.shiftKey ? items.length - 1 : 0]?.focus();
      }
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown);
      openDialogs.splice(openDialogs.indexOf(ref), 1);
    };
  }, []);

  useEffect(() => {
    const returnTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const start =
      initialFocus?.current ??
      ref.current?.querySelector<HTMLElement>('[data-autofocus]');
    const target =
      start && (start.tabIndex >= 0 ? start : focusables(start)[0]);
    (target ?? focusables(ref.current)[0] ?? ref.current)?.focus();
    const { overflow } = document.body.style;
    if (lockScroll) document.body.style.overflow = 'hidden';
    return () => {
      if (lockScroll) document.body.style.overflow = overflow;
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
    // Compared by position, so focus on an element outside the tab order
    // (a menu item, say) still wraps instead of leaving the dialog.
    const follows = (el: Element) =>
      active !== null &&
      Boolean(
        active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    if (!ref.current?.contains(active)) {
      if (e.shiftKey) {
        e.preventDefault();
        last.focus();
      }
    } else if (
      e.shiftKey &&
      !items.some((el) => !follows(el) && el !== active)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && !items.some(follows)) {
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
