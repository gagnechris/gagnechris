import { APP_TITLE, appHost } from '../workspace/access';
import '../workspace/workspace.css';

// The iPhone app's sign-in sheet catches these URLs before they load, so a
// browser only lands here without the app. A code in the query is useless
// without the app's PKCE verifier, and nothing here reads it.
export default function IosAuthReturnPage() {
  return (
    <div className="admin-shell no-access">
      <title>{`Open the app - ${APP_TITLE.notebook}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <main className="no-access__column">
        <div className="workspace-brand">
          <span className="workspace-brand__mark" aria-hidden="true">
            CG
          </span>
          <span className="workspace-brand__text">
            <span className="workspace-brand__title">{APP_TITLE.notebook}</span>
            <span className="workspace-brand__host">{appHost('notebook')}</span>
          </span>
        </div>
        <section className="no-access__card">
          <h1>Finish in the iPhone app</h1>
          <p>
            This page hands sign-in back to the gagnechris iPhone app. Open the
            app to sign in there.
          </p>
          <a className="no-access__primary" href="/">
            Go to {APP_TITLE.notebook} on the web
          </a>
        </section>
      </main>
    </div>
  );
}
