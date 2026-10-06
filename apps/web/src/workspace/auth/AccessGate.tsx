import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP_GROUP, type WorkspaceAppName } from '../access';
import { onAccessDenied } from './accessWatch';
import NoAccessScreen from './NoAccessScreen';
import {
  getAuthUser,
  getIdToken,
  redirectToSignIn,
  type AuthUser,
} from './session';

type Props = {
  app: WorkspaceAppName;
  user: AuthUser;
  children: (user: AuthUser) => ReactNode;
};

/**
 * Renders the app only for users in its group. A token without the group is
 * refreshed once first, since it may predate joining. When the API refuses a
 * request mid-session the session is read again: a lost group shows No access,
 * an ended session goes back to sign-in.
 */
export default function AccessGate({ app, user, children }: Props) {
  const group = APP_GROUP[app];
  const [current, setCurrent] = useState(user);
  const [refreshing, setRefreshing] = useState(!user.groups.includes(group));
  const checking = useRef(false);

  useEffect(() => {
    if (!refreshing) return;
    let cancelled = false;
    void (async () => {
      try {
        await getIdToken({ forceRefresh: true });
        const fresh = await getAuthUser();
        if (!cancelled && fresh) setCurrent(fresh);
      } catch {
        // Keep the user we have: No access still explains what to do.
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshing]);

  useEffect(
    () =>
      onAccessDenied(() => {
        if (checking.current) return;
        checking.current = true;
        void (async () => {
          try {
            const fresh = await getAuthUser();
            if (!fresh) {
              await redirectToSignIn();
              return;
            }
            if (!fresh.groups.includes(group)) setCurrent(fresh);
          } finally {
            checking.current = false;
          }
        })();
      }),
    [group],
  );

  if (refreshing) {
    return (
      <div className="admin-shell admin-shell--centered">
        <p>Checking sign-in…</p>
      </div>
    );
  }
  if (!current.groups.includes(group)) {
    return <NoAccessScreen app={app} user={current} />;
  }
  return <>{children(current)}</>;
}
