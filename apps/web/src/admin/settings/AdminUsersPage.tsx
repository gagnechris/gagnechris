import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ACCESS_LEVEL_LABELS,
  displayName,
  type AccessLevel,
  type ManagedUser,
  USER_ADMIN_GROUP,
} from '@gagnechris/shared';
import { useUserActionMutation, useUsersQuery } from '@gagnechris/app-core';
import { Button } from '@gagnechris/ui';
import { getAuthTime } from '../../workspace/auth/session';
import ShellIcon from '../../workspace/ui/ShellIcon';
import type { AdminOutletContext } from '../AdminLayout';
import EditUserDrawer from './EditUserDrawer';
import InviteUserDialog from './InviteUserDialog';
import { UserAvatar } from './UserAvatar';
import { useUserChange } from './useUserChange';
import { takePendingChange } from './userChange';
import {
  formatAdded,
  hasApp,
  LEVEL_APPS,
  LEVEL_DESCRIPTIONS,
  LEVEL_ORDER,
  isRemovalUnfinished,
  statusLabel,
  userErrorMessage,
} from '@gagnechris/app-core';
import './users.css';

const TOAST_MS = 2600;

function LevelChip({ level }: { level: AccessLevel | null }) {
  return level ? (
    <span className={`users-chip users-chip--${level}`}>
      {ACCESS_LEVEL_LABELS[level]}
    </span>
  ) : (
    <span className="users-chip">No access</span>
  );
}

function AppTag({ app, on = true }: { app: string; on?: boolean }) {
  return (
    <span className={on ? 'users-app' : 'users-app users-app--off'}>
      {app}
      {on ? null : (
        <span className="workspace-visually-hidden"> (no access)</span>
      )}
    </span>
  );
}

function NoAccess() {
  return (
    <section className="workspace-panel">
      <title>No access - Admin</title>
      <h1>No access</h1>
      <p className="workspace-panel__lede">
        Only Full Admins can manage users. Ask a Full Admin if you need this
        page.
      </p>
    </section>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useOutletContext<AdminOutletContext>();
  const allowed = me.groups.includes(USER_ADMIN_GROUP);
  const { data: users, error: loadError, isPending } = useUsersQuery(allowed);
  const resend = useUserActionMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const { perform } = useUserChange(me.userId);
  const resumed = useRef(false);
  useEffect(() => {
    if (!allowed || resumed.current) return;
    resumed.current = true;
    void (async () => {
      const change = takePendingChange(
        await getAuthTime().catch(() => null),
        me.userId,
      );
      if (!change) return;
      try {
        const outcome = await perform(change, { confirmed: true });
        if (outcome.status === 'done') setToast(outcome.toast);
      } catch (err) {
        setRowError(userErrorMessage(err, 'Could not finish that change.'));
      }
    })();
  }, [allowed, perform, me.userId]);

  if (!allowed) return <NoAccess />;

  const editing = users?.find((u) => u.id === editingId) ?? null;
  const counts = Object.fromEntries(
    LEVEL_ORDER.map((level) => [
      level,
      (users ?? []).filter((u) => u.level === level && u.status !== 'removed')
        .length,
    ]),
  ) as Record<AccessLevel, number>;

  const resendInvite = async (user: ManagedUser) => {
    setRowError(null);
    try {
      await resend.mutateAsync({ id: user.id, action: 'resend-invite' });
      setToast(`Invite sent again to ${user.email}.`);
    } catch (err) {
      setRowError(userErrorMessage(err, 'Could not resend the invite.'));
    }
  };

  const error = loadError
    ? userErrorMessage(loadError, 'Could not load users.')
    : rowError;

  return (
    <section className="workspace-panel users-page">
      <title>Users & access - Admin</title>
      <div className="users-header">
        <div>
          <div className="users-eyebrow">Settings</div>
          <h1>Users &amp; access</h1>
          <p className="users-muted">
            Who can sign in, and which apps they can open. Only Full Admins can
            see this page.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={(e) => {
            // Safari doesn't focus a clicked button, and the dialog returns
            // focus to whatever had it when it opened.
            e.currentTarget.focus();
            setInviting(true);
          }}
        >
          <ShellIcon name="plus" />
          Invite user
        </Button>
      </div>

      <section className="users-levels" aria-label="Access levels">
        {LEVEL_ORDER.map((level) => (
          <div key={level} className="users-level-card">
            <div className="users-level-card__top">
              <LevelChip level={level} />
              <span className="users-level-card__count">
                {counts[level]} {counts[level] === 1 ? 'user' : 'users'}
              </span>
            </div>
            <p>{LEVEL_DESCRIPTIONS[level]}</p>
            <div className="users-apps">
              {LEVEL_APPS[level].map((app) => (
                <AppTag key={app} app={app} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {error ? (
        <p className="workspace-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {isPending && !loadError ? <p>Loading…</p> : null}

      {users ? (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Access</th>
                <th scope="col">Apps</th>
                <th scope="col">Status</th>
                <th scope="col">Added</th>
                <th scope="col">
                  <span className="workspace-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const name = displayName(user);
                return (
                  <tr
                    key={user.id}
                    className="users-row"
                    onClick={(event) => {
                      // Edit stays the keyboard path; a tap anywhere else on the row opens it too.
                      if (!(event.target as Element).closest('button, a')) {
                        setEditingId(user.id);
                      }
                    }}
                  >
                    <td>
                      <div className="users-person">
                        <UserAvatar user={user} />
                        <div>
                          <div className="users-person__name">
                            {name}
                            {user.id === me.userId ? (
                              <span className="users-person__you"> (you)</span>
                            ) : null}
                          </div>
                          <div className="users-muted">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <LevelChip level={user.level} />
                    </td>
                    <td>
                      <div className="users-apps">
                        <AppTag app="Admin" on={hasApp(user, 'Admin')} />
                        <AppTag app="Notebook" on={hasApp(user, 'Notebook')} />
                      </div>
                    </td>
                    <td>
                      <span
                        className={`users-status users-status--${isRemovalUnfinished(user) ? 'unfinished' : user.status}`}
                      >
                        <span
                          className="users-status__dot"
                          aria-hidden="true"
                        />
                        {statusLabel(user)}
                      </span>
                      {user.status === 'invited' ? (
                        <Button
                          variant="link"
                          className="users-resend"
                          disabled={resend.isPending}
                          aria-label={`Resend invite to ${name}`}
                          onClick={() => void resendInvite(user)}
                        >
                          Resend invite
                        </Button>
                      ) : null}
                    </td>
                    <td className="users-muted">
                      {formatAdded(user.createdAt)}
                    </td>
                    <td className="users-table__actions">
                      <Button
                        size="sm"
                        aria-label={`Edit access for ${name}`}
                        onClick={(e) => {
                          e.currentTarget.focus();
                          setEditingId(user.id);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="users-muted">
        Each person’s Notebook is private to them; giving or removing access
        never shows you their notes.
      </p>

      {editing ? (
        <EditUserDrawer
          key={editing.id}
          user={editing}
          isSelf={editing.id === me.userId}
          requesterId={me.userId}
          onClose={() => setEditingId(null)}
          onToast={setToast}
        />
      ) : null}
      {inviting ? (
        <InviteUserDialog
          onClose={() => setInviting(false)}
          onToast={setToast}
          requesterId={me.userId}
        />
      ) : null}
      <div className="users-toast-region" role="status" aria-live="polite">
        {toast ? <div className="users-toast">{toast}</div> : null}
      </div>
    </section>
  );
}
