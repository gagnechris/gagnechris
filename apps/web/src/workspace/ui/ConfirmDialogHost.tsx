import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from '@gagnechris/ui';
import { confirmStore } from '../confirmDialog';

/** Renders `appConfirm` questions; mount once per app. */
export function ConfirmDialogHost() {
  const request = useSyncExternalStore(
    confirmStore.subscribe,
    confirmStore.get,
  );
  if (!request) return null;
  // Keyed so each question mounts fresh and takes focus.
  return createPortal(
    <ConfirmDialog
      key={request.message + request.action}
      message={request.message}
      action={request.action}
      onAnswer={confirmStore.answer}
    />,
    document.body,
  );
}
