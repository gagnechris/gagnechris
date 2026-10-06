import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACCESS_LEVEL_LABELS, type ManagedUser } from '@gagnechris/shared';
import {
  useSetUserAccessMutation,
  useUserActionMutation,
  type UserAction,
} from '@gagnechris/app-core';
import ShellIcon from '../../workspace/ui/ShellIcon';
import { AccessLevelRadios } from './AccessLevelRadios';
import { UserAvatar } from './UserAvatar';
import { useModal } from './useModal';
import {
  accessChange,
  displayName,
  formatAdded,
  userErrorMessage,
} from './userAccess';

type Props = {
  user: ManagedUser;
  isSelf: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
};

const ACTION_TOASTS: Record<UserAction, (name: string) => string> = {
  'sign-out': (name) => `${name} is signed out everywhere.`,
  disable: (name) => `${name} can no longer sign in.`,
  enable: (name) => `${name} can sign in again.`,
  remove: (name) => `${name} no longer has access. Their notes are kept.`,
  restore: (name) => `${name} has access again.`,
  'resend-invite': (name) => `Invite sent again to ${name}.`,
};

export default function EditUserDrawer({
  user,
  isSelf,
  onClose,
  onToast,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModal(panelRef, onClose);
  const setAccess = useSetUserAccessMutation();
  const action = useUserActionMutation();
  const [draft, setDraft] = useState(user.level);
  const [error, setError] = useState<string | null>(null);
  const name = displayName(user);
  const removed = user.status === 'removed';
  const busy = setAccess.isPending || action.isPending;
  const changed = draft !== null && draft !== user.level;
  const change =
    changed && !removed ? accessChange(user, user.level, draft) : null;

  const save = async () => {
    if (!draft) return;
    setError(null);
    try {
      await setAccess.mutateAsync({ id: user.id, level: draft });
      onToast(`${name} now has ${ACCESS_LEVEL_LABELS[draft]} access.`);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'Could not change access.'));
    }
  };

  const run = async (kind: UserAction) => {
    setError(null);
    try {
      await action.mutateAsync({
        id: user.id,
        action: kind,
        level: kind === 'restore' && draft ? draft : undefined,
      });
      onToast(ACTION_TOASTS[kind](name));
    } catch (err) {
      setError(userErrorMessage(err, 'Could not update this user.'));
    }
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
  };

  const accountRow = (
    label: string,
    hint: string,
    button: string,
    kind: UserAction,
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
        disabled={busy || (kind === 'restore' && !draft)}
        onClick={() => void run(kind)}
      >
        {button}
      </button>
    </div>
  );

  return createPortal(
    <div className="users-overlay users-overlay--drawer">
      <button
        type="button"
        className="users-scrim"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="users-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit access for ${name}`}
      >
        <div className="users-drawer__head">
          <UserAvatar user={user} size="large" />
          <div className="users-drawer__who">
            <h2>{name}</h2>
            <div className="users-muted">{user.email}</div>
            <div className="users-meta">
              Added: {formatAdded(user.createdAt)}
            </div>
          </div>
          <button
            type="button"
            className="users-icon-btn"
            aria-label="Close"
            data-autofocus
            onClick={onClose}
          >
            <ShellIcon name="close" />
          </button>
        </div>

        <AccessLevelRadios
          value={draft}
          onChange={setDraft}
          isDisabled={(level) => isSelf && level !== 'full'}
          disabled={busy}
        />

        {isSelf ? (
          <p className="users-callout">
            You can’t lower your own access or disable yourself. There must
            always be at least one Full Admin.
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

        {error ? (
          <p className="admin-panel__error" role="alert">
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

        <div className="users-drawer__foot">
          <button type="button" className="users-btn" onClick={onClose}>
            Cancel
          </button>
          {removed ? null : (
            <button
              type="button"
              className="users-btn users-btn--primary"
              disabled={!changed || busy}
              onClick={() => void save()}
            >
              {setAccess.isPending ? 'Saving…' : 'Save access'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
