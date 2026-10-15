/** @jsxRuntime automatic */
import { Button } from './Button.js';
import { useModalDialog } from './useModalDialog.js';

type Props = {
  message: string;
  action: string;
  onAnswer: (ok: boolean) => void;
};

/** A centred yes/no question; the confirming action is styled as danger. */
export function ConfirmDialog({ message, action, onAnswer }: Props) {
  const { dialogProps } = useModalDialog<HTMLElement>({
    label: message,
    onClose: () => onAnswer(false),
    lockScroll: true,
  });
  return (
    <div className="confirm-dialog">
      <div className="confirm-dialog__scrim" onClick={() => onAnswer(false)} />
      <section
        {...dialogProps}
        role="alertdialog"
        className="confirm-dialog__panel"
      >
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <Button onClick={() => onAnswer(false)}>Cancel</Button>
          <Button
            variant="danger"
            data-autofocus
            onClick={() => onAnswer(true)}
          >
            {action}
          </Button>
        </div>
      </section>
    </div>
  );
}
