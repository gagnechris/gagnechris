import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../kit/Button';
import { confirmStore, type ConfirmRequest } from '../confirmDialog';
import { useModalDialog } from '../../kit/useModalDialog';
import './confirmDialog.css';

function ConfirmDialog({ request }: { request: ConfirmRequest }) {
  const { dialogProps } = useModalDialog<HTMLElement>({
    label: request.message,
    onClose: () => confirmStore.answer(false),
    lockScroll: true,
  });
  return (
    <div className="confirm-dialog">
      <div
        className="confirm-dialog__scrim"
        onClick={() => confirmStore.answer(false)}
      />
      <section
        {...dialogProps}
        role="alertdialog"
        className="confirm-dialog__panel"
      >
        <p className="confirm-dialog__message">{request.message}</p>
        <div className="confirm-dialog__actions">
          <Button onClick={() => confirmStore.answer(false)}>Cancel</Button>
          <Button
            variant="danger"
            data-autofocus
            onClick={() => confirmStore.answer(true)}
          >
            {request.action}
          </Button>
        </div>
      </section>
    </div>
  );
}

/** Renders `appConfirm` questions; mount once per app. */
export function ConfirmDialogHost() {
  const request = useSyncExternalStore(
    confirmStore.subscribe,
    confirmStore.get,
  );
  if (!request) return null;
  // Keyed so each question mounts fresh and takes focus.
  return createPortal(
    <ConfirmDialog key={request.message + request.action} request={request} />,
    document.body,
  );
}
