import { useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AccessLevel } from '@gagnechris/shared';
import { useInviteUserMutation } from '@gagnechris/app-core';
import ShellIcon from '../../workspace/ui/ShellIcon';
import { AccessLevelRadios } from './AccessLevelRadios';
import { useModal } from './useModal';
import { displayName, userErrorMessage } from './userAccess';

type Props = {
  onClose: () => void;
  onToast: (message: string) => void;
};

export default function InviteUserDialog({ onClose, onToast }: Props) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  useModal(formRef, onClose);
  const invite = useInviteUserMutation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<AccessLevel>('notebook');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { user, restored } = await invite.mutateAsync({
        email: email.trim(),
        name: name.trim() || undefined,
        level,
      });
      onToast(
        restored
          ? `${displayName(user)} has access again. Their notes are back.`
          : `Invite sent to ${user.email}.`,
      );
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'Could not send the invite.'));
    }
  };

  return createPortal(
    <div className="users-overlay users-overlay--dialog">
      <button
        type="button"
        className="users-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <form
        ref={formRef}
        className="users-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={(e) => void submit(e)}
      >
        <div className="users-dialog__head">
          <h2 id={`${id}-title`}>Invite user</h2>
          <button
            type="button"
            className="users-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <ShellIcon name="close" />
          </button>
        </div>
        <div className="users-dialog__fields">
          <label className="users-input">
            <span>Name</span>
            <input
              type="text"
              placeholder="Full name"
              autoComplete="off"
              maxLength={100}
              value={name}
              data-autofocus
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="users-input">
            <span>Email</span>
            <input
              type="email"
              placeholder="name@example.com"
              autoComplete="off"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <AccessLevelRadios
          value={level}
          onChange={setLevel}
          disabled={invite.isPending}
        />
        <p className="users-muted">
          They’ll get an email with a temporary password that works for 7 days;
          you can resend it from the list. Inviting someone you removed restores
          their old notes.
        </p>
        {error ? (
          <p className="admin-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="users-dialog__foot">
          <button type="button" className="users-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="users-btn users-btn--primary"
            disabled={invite.isPending}
          >
            {invite.isPending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
