import {
  useVersionedEntityEditor as useVersionedEntityEditorCore,
  type VersionedEntityEditorOptions,
} from '@gagnechris/app-core';
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Web shell around app-core versioned editors: injects `window.confirm`, leave
 * guards, beforeunload, and ⌘S / ⌘⏎ shortcuts (ignores ⌘S while busy).
 */
export function useVersionedEntityEditor<
  TEntity extends {
    version: number;
    status: 'draft' | 'published' | 'deleted';
    hasUnpublishedChanges: boolean;
  },
  TDraft,
  TParams,
>(
  options: Omit<
    VersionedEntityEditorOptions<TEntity, TDraft, TParams>,
    'confirm'
  >,
) {
  const editor = useVersionedEntityEditorCore({
    ...options,
    confirm: (message) => Promise.resolve(window.confirm(message)),
  });

  const { dirty, busy, saveRef, publishRef, suppressLeaveGuardRef } = editor;

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

  return editor;
}
