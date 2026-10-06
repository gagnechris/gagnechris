import { Link } from 'react-router-dom';
import { SITE_AUTHOR_NAME } from '@gagnechris/shared';

export default function WorkspaceNotFound() {
  return (
    <section className="admin-panel">
      <title>{`Not found - ${SITE_AUTHOR_NAME}`}</title>
      <h1>Page not found</h1>
      <p className="admin-panel__lede">
        <Link to="/">Back to the start</Link>
      </p>
    </section>
  );
}
