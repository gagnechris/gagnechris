import { useRef, useState } from 'react';
import {
  ACCESS_LEVEL_LABELS,
  displayName,
  type ManagedUser,
} from '@gagnechris/shared';
import { BottomSheet } from '../../kit/BottomSheet';
import { PHONE_QUERY, useMediaQuery } from '../../kit/useMediaQuery';
import ShellIcon from '../../workspace/ui/ShellIcon';
import { AccessLevelRadios } from './AccessLevelRadios';
import { UserAvatar } from './UserAvatar';
import { UsersOverlay } from './UsersOverlay';
import { useUserChange } from './useUserChange';
import {
  accessChange,
  type UserChange,
  formatAdded,
  userErrorMessage,
} from '@gagnechris/app-core';

type Props = {
  user: ManagedUser;
  isSelf: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
};

type AccountAction = Exclude<UserChange['kind'], 'access' | 'invite'>;

export default function EditUserDrawer({
  user,
  isSelf,
  onClose,
  onToast,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const phone = useMediaQuery(PHONE_QUERY);
  const { perform, isPending: busy } = useUserChange();
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(user.level);
  const [error, setError] = useState<string | null>(null);
  const name = displayName(user);
  const removed = user.status === 'removed';
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
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
  };

  const save = () =>
    draft
      ? submit(
          { id: user.id, name, kind: 'access', level: draft },
          'Could not change access.',
        )
      : Promise.resolve();

  const run = (kind: AccountAction) =>
    submit(
      {
        id: user.id,
        name,
        kind,
        level: kind === 'restore' && draft ? draft : undefined,
      },
      'Could not update this user.',
    );

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
      <button
        type="button"
        className={
          danger
            ? 'users-btn users-btn--small users-btn--danger'
            : 'users-btn users-btn--small'
        }
        disabled={busy || confirming || (kind === 'restore' && !draft)}
        onClick={() => void run(kind)}
      >
        {button}
      </button>
    </div>
  );

  const content = (
    <>
      <div className="users-drawer__head">
        <UserAvatar user={user} size="large" />
        <div className="users-drawer__who">
          <h2>{name}</h2>
          <div className="users-muted">{user.email}</div>
          <div className="users-meta">Added: {formatAdded(user.createdAt)}</div>
        </div>
        {phone ? null : (
          <button
            type="button"
            className="users-icon-btn"
            aria-label="Close"
            data-autofocus
            onClick={onClose}
          >
            <ShellIcon name="close" />
          </button>
        )}
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
    </>
  );

  if (phone) {
    return (
      <BottomSheet
        title="Edit access"
        label={`Edit access for ${name}`}
        onClose={onClose}
        done={
          removed ? undefined : (
            <button
              type="button"
              className="bottom-sheet__button bottom-sheet__button--done"
              disabled={!changed || busy || confirming}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          )
        }
      >
        {content}
      </BottomSheet>
    );
  }

  return (
    <UsersOverlay
      kind="drawer"
      label={`Edit access for ${name}`}
      onClose={onClose}
      panelRef={panelRef}
    >
      {content}
      <div className="users-drawer__foot">
        <button type="button" className="users-btn" onClick={onClose}>
          Cancel
        </button>
        {removed ? null : (
          <button
            type="button"
            className="users-btn users-btn--primary"
            disabled={!changed || busy || confirming}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save access'}
          </button>
        )}
      </div>
    </UsersOverlay>
  );
}
