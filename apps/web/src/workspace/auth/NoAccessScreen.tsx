import {
  accessLevel,
  APP_GROUP,
  APP_TITLE,
  appHost,
  appOrigin,
  type WorkspaceAppName,
} from '../access';
import ShellIcon from '../ui/ShellIcon';
import { signOutUser, type AuthUser } from './session';

/** Shown instead of the app to a signed-in user without the app's group. */
export default function NoAccessScreen({
  app,
  user,
}: {
  app: WorkspaceAppName;
  user: AuthUser;
}) {
  const title = APP_TITLE[app];
  const other: WorkspaceAppName = app === 'admin' ? 'notebook' : 'admin';
  const hasOther = user.groups.includes(APP_GROUP[other]);
  const signOut = () => void signOutUser();

  return (
    <div className="admin-shell no-access">
      <title>{`No access - ${title}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <main className="no-access__column">
        <div className="workspace-brand">
          <span className="workspace-brand__mark" aria-hidden="true">
            CG
          </span>
          <span className="workspace-brand__text">
            <span className="workspace-brand__title">{title}</span>
            <span className="workspace-brand__host">{appHost(app)}</span>
          </span>
        </div>
        <section className="no-access__card">
          <span className="no-access__icon" aria-hidden="true">
            <ShellIcon name="lock" size={22} />
          </span>
          <h1>You don’t have access to {title}</h1>
          <p>
            You’re signed in as <strong>{user.label}</strong> with{' '}
            <strong>{accessLevel(user.groups)}</strong> access. Ask a Full Admin
            if you need {title}.
          </p>
          {hasOther ? (
            <a className="no-access__primary" href={`${appOrigin(other)}/`}>
              Go to {APP_TITLE[other]}
            </a>
          ) : null}
          <div className="no-access__row">
            <button type="button" onClick={signOut}>
              Use a different account
            </button>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </section>
        <a className="no-access__home" href={`${appOrigin('public')}/`}>
          Back to gagnechris.com
        </a>
      </main>
    </div>
  );
}
