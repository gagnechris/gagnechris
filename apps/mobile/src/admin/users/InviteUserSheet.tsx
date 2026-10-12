import { useInviteUserMutation, userErrorMessage } from '@gagnechris/app-core';
import { displayName, type AccessLevel } from '@gagnechris/shared';
import { useState } from 'react';
import { Button } from '../../ui/Button';
import {
  DetailsSheet,
  FieldError,
  FieldHint,
  TextField,
} from '../DetailsSheet';
import { AccessLevelPicker } from './AccessLevelPicker';

type Props = {
  visible: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
};

export const InviteUserSheet = ({ visible, onClose, onDone }: Props) => {
  const invite = useInviteUserMutation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<AccessLevel>('notebook');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setEmail('');
    setLevel('notebook');
    setError(null);
    onClose();
  };

  const send = async () => {
    setError(null);
    try {
      const { user, restored } = await invite.mutateAsync({
        email: email.trim(),
        name: name.trim() || undefined,
        level,
      });
      onDone(
        restored
          ? `${displayName(user)} has access again. Their notes are back.`
          : `Invite sent to ${user.email}.`,
      );
      close();
    } catch (err) {
      setError(userErrorMessage(err, 'Could not send the invite.'));
    }
  };

  return (
    <DetailsSheet visible={visible} onClose={close} title="Invite user">
      <TextField
        label="Name"
        value={name}
        placeholder="Full name"
        maxLength={100}
        textContentType="name"
        onChangeText={setName}
      />
      <TextField
        label="Email"
        value={email}
        placeholder="name@example.com"
        maxLength={254}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        onChangeText={setEmail}
      />
      <AccessLevelPicker value={level} onChange={setLevel} />
      <FieldHint>
        They’ll get an email with a temporary password that works for 7 days;
        you can resend it from their row. Inviting someone you removed restores
        their old notes.
      </FieldHint>
      <FieldError>{error ?? undefined}</FieldError>
      <Button
        title={invite.isPending ? 'Sending…' : 'Send invite'}
        disabled={invite.isPending || !email.trim()}
        onPress={() => void send()}
      />
    </DetailsSheet>
  );
};
