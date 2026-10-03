import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

export type VersionedDocShellOptions = {
  dirty: boolean;
  busy: boolean;
  saveRef: { current: () => unknown };
  suppressLeaveGuardRef: { current: boolean };
  /** Omit for non-publishable docs such as Notebook notes (no ⌘⏎ publish). */
  publishRef?: { current: () => unknown };
};

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
  // Save first, then leave; only ask when the save did not land.
  const handlingRef = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || handlingRef.current) return;
    handlingRef.current = true;
    void (async () => {
      const saved = await Promise.resolve(saveRef.current()).then(
        (outcome) => outcome === 'clean',
        () => false,
      );
      const leave =
        saved ||
        window.confirm(
          'Your changes could not be saved. Leave without saving?',
        );
      handlingRef.current = false;
      if (leave) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    })();
  }, [blocker, saveRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        // Ignore ⌘S while publish/unpublish/discard/delete hold is active
        // so a PUT cannot race with the in-flight version bump.
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
