import {
  useDraftPublishEditor as useDraftPublishEditorCore,
  type DraftPublishEditorOptions,
} from '@gagnechris/app-core';
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Web shell around app-core draft/publish: injects `window.confirm`, leave
 * guards, beforeunload, and ⌘S / ⌘⏎ shortcuts.
 */
export function useDraftPublishEditor<TEntity>(
  options: Omit<DraftPublishEditorOptions<TEntity>, 'confirm'>,
) {
  const editor = useDraftPublishEditorCore({
    ...options,
    confirm: (message) => Promise.resolve(window.confirm(message)),
  });

  const { dirty } = options;
  const { saveRef, publishRef } = editor;

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const blocker = useBlocker(dirty);
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
        void saveRef.current();
        return;
      }
      // ⌘⏎ = publish. Skip when typing inside CodeMirror so Enter/Mod-Enter
      // keep their editor meaning (CHR-148).
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
        void publishRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [publishRef, saveRef]);

  return {
    busy: editor.busy,
    setBusy: editor.setBusy,
    runPublish: editor.runPublish,
    runUnpublish: editor.runUnpublish,
    runDiscard: editor.runDiscard,
  };
}
