import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export type VersionedDocShellOptions = {
  dirty: boolean;
  busy: boolean;
  saveRef: { current: () => unknown };
  suppressLeaveGuardRef: { current: boolean };
  /**
   * When set, ⌘⏎ triggers publish (draft/publish editors). Omit for
   * non-publishable docs such as Notebook notes (CHR-173).
   */
  publishRef?: { current: () => unknown };
};

/**
 * Web shell around versioned doc editors: leave guards, beforeunload, and ⌘S.
 * ⌘⏎ is optional via `publishRef`.
 */
export function useVersionedDocShell({
  dirty,
  busy,
  saveRef,
  suppressLeaveGuardRef,
  publishRef,
}: VersionedDocShellOptions) {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || suppressLeaveGuardRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, suppressLeaveGuardRef]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !suppressLeaveGuardRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const leave = window.confirm(
      'You have unsaved changes. Leave without saving?',
    );
    if (leave) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        // Ignore ⌘S while publish/unpublish/discard/delete hold is active
        // so a PUT cannot race with the in-flight version bump (CHR-158).
        if (busy) return;
        void saveRef.current();
        return;
      }
      if (!publishRef) return;
      if (meta && event.key === 'Enter') {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest('.cm-editor, .markdown-editor')
        ) {
          return;
        }
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (busy) return;
        void publishRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, publishRef, saveRef]);
}
