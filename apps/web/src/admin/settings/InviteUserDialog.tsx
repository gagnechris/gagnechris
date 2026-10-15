import { useId, useState, type FormEvent } from 'react';
import type { AccessLevel } from '@gagnechris/shared';
import { userErrorMessage } from '@gagnechris/app-core';
import { createPortal } from 'react-dom';
import { Button, Dialog, Field, TextInput } from '@gagnechris/ui';
import { PHONE_QUERY, useMediaQuery } from '../../kit/useMediaQuery';
import { AccessLevelRadios } from './AccessLevelRadios';
import { useUserChange } from './useUserChange';

type Props = {
  onClose: () => void;
  onToast: (message: string) => void;
  requesterId: string;
};

export default function InviteUserDialog({
  onClose,
  onToast,
  requesterId,
}: Props) {
  const id = useId();
  const phone = useMediaQuery(PHONE_QUERY);
  const { perform, isPending } = useUserChange(requesterId);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<AccessLevel>('notebook');
  const [error, setError] = useState<string | null>(null);
  const busy = isPending || confirming;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const outcome = await perform({
        kind: 'invite',
        email: email.trim(),
        name: name.trim() || undefined,
        level,
      });
      if (outcome.status === 'confirming') {
        setConfirming(true);
        return;
      }
      onToast(outcome.toast);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'Could not send the invite.'));
    }
  };

  const formId = `${id}-form`;

  return createPortal(
    <Dialog
      title="Invite user"
      onClose={onClose}
      actions={
        <Button type="submit" form={formId} variant="primary" disabled={busy}>
          {busy ? 'Sending…' : phone ? 'Send' : 'Send invite'}
        </Button>
      }
    >
      <form
        id={formId}
        className="users-dialog-form"
        onSubmit={(e) => void submit(e)}
      >
        <div className="users-dialog__fields">
          <Field label="Name">
            <TextInput
              type="text"
              placeholder="Full name"
              autoComplete="off"
              maxLength={100}
              value={name}
              data-autofocus
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              placeholder="name@example.com"
              autoComplete="off"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <AccessLevelRadios value={level} onChange={setLevel} disabled={busy} />
        <p className="users-muted">
          They’ll get an email with a temporary password that works for 7 days;
          you can resend it from the list. Inviting someone you removed restores
          their old notes.
        </p>
        {confirming ? (
          <p className="users-callout" role="status">
            Confirm it’s you with your passkey to send this invite…
          </p>
        ) : null}
        {error ? (
          <p className="workspace-panel__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>,
    document.body,
  );
}
