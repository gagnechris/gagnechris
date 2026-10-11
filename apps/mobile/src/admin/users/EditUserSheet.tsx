import {
  accessChange,
  changeToast,
  displayName,
  formatAdded,
  STATUS_LABELS,
  useUserActionMutation,
  userErrorMessage,
  type UserChange,
} from '@gagnechris/app-core';
import { ACCESS_LEVEL_LABELS, type ManagedUser } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../../theme';
import { Button } from '../../ui/Button';
import { confirmAction } from '../../ui/confirm';
import { Row } from '../../ui/Row';
import { Section } from '../../ui/Section';
import { DetailsSheet, FieldError, FieldHint } from '../DetailsSheet';
import { AccessLevelPicker } from './AccessLevelPicker';
import { useUserChange } from './useUserChange';

type Props = {
  user: ManagedUser;
  isSelf: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
};

type AccountAction = Exclude<UserChange['kind'], 'access'>;

/** Asked first, since they act on the person straight away. */
const CONFIRMS: Partial<Record<AccountAction, [string, string, string]>> = {
  'sign-out': [
    'Sign out everywhere?',
    'Ends their sessions in Admin and Notebook now.',
    'Sign out',
  ],
  disable: [
    'Disable sign-in?',
    'Keeps the account and Notebook, but blocks sign-in.',
    'Disable',
  ],
  remove: [
    'Remove access?',
    'Takes away every app. Their Notebook is kept, so if they come back their notes come back too.',
    'Remove',
  ],
};

export const EditUserSheet = ({ user, isSelf, onClose, onDone }: Props) => {
  const { perform, isPending } = useUserChange();
  const resend = useUserActionMutation();
  const [draft, setDraft] = useState(user.level);
  const [error, setError] = useState<string | null>(null);
  const name = displayName(user);
  const removed = user.status === 'removed';
  const busy = isPending || resend.isPending;
  const changed = draft !== null && draft !== user.level;
  const change =
    changed && !removed ? accessChange(user, user.level, draft) : null;

  const submit = async (next: UserChange, fallback: string) => {
    setError(null);
    try {
      if ((await perform(next)) === 'cancelled') return;
      onDone(changeToast(next));
      if (next.kind === 'access') onClose();
    } catch (err) {
      setError(userErrorMessage(err, fallback));
    }
  };

  const run = async (kind: AccountAction) => {
    const prompt = CONFIRMS[kind];
    if (prompt && !(await confirmAction(...prompt))) return;
    await submit(
      {
        id: user.id,
        name,
        kind,
        level: kind === 'restore' && draft ? draft : undefined,
      },
      'Could not update this user.',
    );
  };

  const resendInvite = async () => {
    setError(null);
    try {
      await resend.mutateAsync({ id: user.id, action: 'resend-invite' });
      onDone(`Invite sent again to ${user.email}.`);
    } catch (err) {
      setError(userErrorMessage(err, 'Could not resend the invite.'));
    }
  };

  const actions: { title: string; kind: AccountAction; danger?: boolean }[] =
    removed
      ? [{ title: 'Restore access', kind: 'restore' }]
      : [
          { title: 'Sign out everywhere', kind: 'sign-out' },
          user.status === 'disabled'
            ? { title: 'Enable sign-in', kind: 'enable' }
            : { title: 'Disable sign-in', kind: 'disable' },
          { title: 'Remove access', kind: 'remove', danger: true },
        ];

  return (
    <DetailsSheet visible onClose={onClose} title={name}>
      <View style={styles.who}>
        <Text style={styles.email}>{user.email}</Text>
        <Text style={styles.meta}>
          {STATUS_LABELS[user.status]} · Added {formatAdded(user.createdAt)}
        </Text>
      </View>

      <AccessLevelPicker
        value={draft}
        onChange={setDraft}
        isDisabled={(level) => busy || (isSelf && level !== 'full')}
      />
      {isSelf ? (
        <FieldHint>
          You can’t lower your own access or disable yourself. There must always
          be at least one Full Admin.
        </FieldHint>
      ) : null}
      {removed && !isSelf ? (
        <FieldHint>
          Restore gives back {draft ? ACCESS_LEVEL_LABELS[draft] : 'their'}{' '}
          access. Their notes and tasks are still there.
        </FieldHint>
      ) : null}
      {change ? (
        <View style={styles.callout} accessibilityLiveRegion="polite">
          <Text style={styles.calloutTitle}>{change.title}</Text>
          <Text style={styles.calloutBody}>{change.body}</Text>
        </View>
      ) : null}
      <FieldError>{error ?? undefined}</FieldError>
      {removed ? null : (
        <Button
          title={isPending ? 'Saving…' : 'Save access'}
          disabled={!changed || busy}
          onPress={() =>
            void (draft
              ? submit(
                  { id: user.id, name, kind: 'access', level: draft },
                  'Could not change access.',
                )
              : undefined)
          }
        />
      )}

      {isSelf ? null : (
        <>
          <Section title="Account">
            {user.status === 'invited' ? (
              <Row title="Resend invite" onPress={() => void resendInvite()} />
            ) : null}
            {actions.map((item, index) => (
              <Row
                key={item.kind}
                title={item.title}
                destructive={item.danger}
                divider={index > 0 || user.status === 'invited'}
                onPress={busy ? undefined : () => void run(item.kind)}
              />
            ))}
          </Section>
          <FieldHint>
            Changing access, signing out, disabling or removing asks for your
            passkey if you haven’t signed in in the last few minutes.
          </FieldHint>
        </>
      )}
    </DetailsSheet>
  );
};

const styles = StyleSheet.create({
  who: { gap: 2, paddingBottom: tokens.space[2] },
  email: { ...font.regular, fontSize: tokens.text.body, color: color.inkSoft },
  meta: { ...font.regular, fontSize: tokens.text.caption, color: color.muted },
  callout: {
    gap: tokens.space[1],
    padding: tokens.space[3],
    borderRadius: tokens.radius.md,
    backgroundColor: color.fill,
  },
  calloutTitle: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.ink,
  },
  calloutBody: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
});
