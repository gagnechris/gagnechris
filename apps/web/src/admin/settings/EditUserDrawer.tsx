import { useRef, useState } from 'react';
import {
  ACCESS_LEVEL_LABELS,
  displayName,
  type ManagedUser,
} from '@gagnechris/shared';
import { createPortal } from 'react-dom';
import { Button, Drawer } from '@gagnechris/ui';
import { PHONE_QUERY, useMediaQuery } from '../../kit/useMediaQuery';
import { appConfirm } from '../../workspace/confirmDialog';
import { AccessLevelRadios } from './AccessLevelRadios';
import { UserAvatar } from './UserAvatar';
import { useUserChange } from './useUserChange';
import {
  ACCOUNT_ACTION_CONFIRMS,
  accessChange,
  type UserChange,
  formatAdded,
  isRemovalUnfinished,
  REMOVAL_UNFINISHED,
  userErrorMessage,
} from '@gagnechris/app-core';

type Props = {
  user: ManagedUser;
  isSelf: boolean;
  requesterId: string;
  onClose: () => void;
  onToast: (message: string) => void;
};

type AccountAction = Exclude<UserChange['kind'], 'access' | 'invite'>;

export default function EditUserDrawer({
  user,
  isSelf,
  requesterId,
  onClose,
  onToast,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const phone = useMediaQuery(PHONE_QUERY);
  const { perform, isPending: busy } = useUserChange(requesterId);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(user.level);
  const [error, setError] = useState<string | null>(null);
  const name = displayName(user);
  const removed = user.status === 'removed';
  const unfinished = isRemovalUnfinished(user);
  const changed = draft !== null && draft !== user.level;
  const change =
    changed && !removed ? accessChange(user, user.level, draft) : null;

  const submit = async (change: UserChange, fallback: string) => {
    setError(null);
    try {
      const outcome = await perform(change);
      if (outcome.status === 'confirming') {
        setConfirming(true);
        return;
      }
      onToast(outcome.toast);
      if (change.kind === 'access') onClose();
    } catch (err) {
      setError(userErrorMessage(err, fallback));
    }
    // An action that disables its own button drops focus out of the panel.
    const panel = contentRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  };

  const save = () =>
    draft
      ? submit(
          { id: user.id, name, kind: 'access', level: draft },
          'Could not change access.',
        )
      : Promise.resolve();

  const run = async (kind: AccountAction) => {
    const prompt = ACCOUNT_ACTION_CONFIRMS[kind];
    if (
      prompt &&
      !(await appConfirm(`${prompt.title} ${prompt.body}`, prompt.action))
    ) {
      return;
    }
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

  const accountRow = (
    label: string,
    hint: string,
    button: string,
    kind: AccountAction,
    danger = false,
  ) => (
    <div className="users-account-row">
      <div>
        <div
          className={
            danger
              ? 'users-account-row__label users-account-row__label--danger'
              : 'users-account-row__label'
          }
        >
          {label}
        </div>
        <div className="users-account-row__hint">{hint}</div>
      </div>
      <Button
        size="sm"
        variant={danger ? 'danger' : 'default'}
        disabled={busy || confirming || (kind === 'restore' && !draft)}
        onClick={() => void run(kind)}
      >
        {button}
      </Button>
    </div>
  );

  const content = (
    <div ref={contentRef} className="users-drawer__content">
      <div className="users-drawer__head">
        <UserAvatar user={user} size="large" />
        <div className="users-drawer__who">
          <h3>{name}</h3>
          <div className="users-muted">{user.email}</div>
          <div className="users-meta">Added: {formatAdded(user.createdAt)}</div>
        </div>
      </div>

      <AccessLevelRadios
        value={draft}
        onChange={setDraft}
        isDisabled={(level) => isSelf && level !== 'full'}
        disabled={busy}
      />

      {isSelf ? (
        <p className="users-callout">
          You can’t lower your own access or disable yourself. There must always
          be at least one Full Admin.
        </p>
      ) : null}
      {unfinished && !isSelf ? (
        <div className="users-callout users-callout--warning" role="status">
          <strong>{REMOVAL_UNFINISHED.title}</strong>
          <span>{REMOVAL_UNFINISHED.body}</span>
        </div>
      ) : null}
      {removed && !isSelf ? (
        <p className="users-callout">
          Restore picks up the access chosen above. Their notes and tasks are
          still there.
        </p>
      ) : null}
      {change ? (
        <div className="users-callout users-callout--warning" role="status">
          <strong>{change.title}</strong>
          <span>{change.body}</span>
        </div>
      ) : null}

      {confirming ? (
        <p className="users-callout" role="status">
          Confirm it’s you with your passkey to finish this change…
        </p>
      ) : null}
      {error ? (
        <p className="workspace-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      {isSelf ? null : (
        <section className="users-account" aria-label="Account">
          <h3>Account</h3>
          {removed
            ? null
            : accountRow(
                'Sign out everywhere',
                'Ends their sessions in Admin and Notebook now.',
                'Sign out',
                'sign-out',
              )}
          {removed
            ? null
            : user.status === 'disabled'
              ? accountRow(
                  'Enable sign-in',
                  'Let them sign in again with their passkey.',
                  'Enable',
                  'enable',
                )
              : accountRow(
                  'Disable sign-in',
                  'Keeps the account and Notebook, but blocks sign-in.',
                  'Disable',
                  'disable',
                )}
          {unfinished
            ? accountRow(
                'Finish removing',
                'Takes away every app and ends their sessions.',
                'Finish removing',
                'remove',
                true,
              )
            : null}
          {removed
            ? accountRow(
                'Restore access',
                `Gives back ${draft ? ACCESS_LEVEL_LABELS[draft] : 'their'} access. Their notes and tasks are still there.`,
                'Restore',
                'restore',
              )
            : accountRow(
                'Remove access',
                'Takes away every app. Their Notebook is kept, so if they come back their notes come back too.',
                'Remove',
                'remove',
                true,
              )}
        </section>
      )}

      {isSelf ? null : (
        <p className="users-muted">
          Changing access, signing out, disabling or removing asks for your
          passkey if you haven’t signed in in the last few minutes.
        </p>
      )}
    </div>
  );

  return createPortal(
    <Drawer
      title="Edit access"
      label={`Edit access for ${name}`}
      onClose={onClose}
      actions={
        removed ? undefined : (
          <Button
            variant="primary"
            disabled={!changed || busy || confirming}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : phone ? 'Save' : 'Save access'}
          </Button>
        )
      }
    >
      {content}
    </Drawer>,
    document.body,
  );
}
