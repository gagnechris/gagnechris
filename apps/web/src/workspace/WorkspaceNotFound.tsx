import { Link } from 'react-router-dom';

export default function WorkspaceNotFound() {
  return (
    <section className="admin-panel">
      <title>Not found - Chris Gagne</title>
      <h1>Page not found</h1>
      <p className="admin-panel__lede">
        <Link to="/">Back to the start</Link>
      </p>
    </section>
  );
}
