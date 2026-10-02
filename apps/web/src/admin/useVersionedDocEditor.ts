import {
  useVersionedDocEditor as useVersionedDocEditorCore,
  type VersionedDocEditorOptions,
} from '@gagnechris/app-core';
import { useVersionedDocShell } from './useVersionedDocShell';

/**
 * Web shell around app-core non-publishable editors: injects `window.confirm`
 * and wires leave guards + ⌘S via `useVersionedDocShell` (no ⌘⏎ publish).
 */
export function useVersionedDocEditor<
  TEntity extends { version: number },
  TDraft,
  TParams,
>(
  options: Omit<VersionedDocEditorOptions<TEntity, TDraft, TParams>, 'confirm'>,
) {
  const editor = useVersionedDocEditorCore({
    ...options,
    confirm: (message) => Promise.resolve(window.confirm(message)),
  });

  useVersionedDocShell({
    dirty: editor.dirty,
    busy: editor.busy,
    saveRef: editor.saveRef,
    suppressLeaveGuardRef: editor.suppressLeaveGuardRef,
  });

  return editor;
}
