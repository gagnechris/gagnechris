import { Link } from 'react-router-dom';
import { homeResource, resumeResource } from '@gagnechris/app-core';
import { StatusBadge } from '../kit/StatusBadge';

type PageState = {
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges?: boolean;
};

const PageRow = ({
  to,
  title,
  path,
  page,
}: {
  to: string;
  title: string;
  path: string;
  page: PageState | undefined;
}) => (
  <li>
    <Link to={to} className="admin-post-list__item admin-post-list__link">
      <span className="admin-post-list__title">{title}</span>
      <span className="admin-post-list__meta">
        {page ? (
          <StatusBadge
            status={page.status}
            hasUnpublishedChanges={page.hasUnpublishedChanges}
          />
        ) : null}
        <code>{path}</code>
      </span>
    </Link>
  </li>
);

export default function AdminPagesPage() {
  const home = homeResource.useQuery({});
  const resume = resumeResource.useQuery({});
  const failed = home.error ?? resume.error;

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h1>Pages</h1>
          <p className="admin-panel__lede">
            Everything on gagnechris.com besides posts and projects.
          </p>
        </div>
      </div>
      {failed ? (
        <p className="admin-panel__error" role="alert">
          Could not load page status.
        </p>
      ) : null}
      <ul className="admin-post-list" aria-label="Site pages">
        <PageRow to="/home" title="Home page" path="/" page={home.data} />
        <PageRow
          to="/resume"
          title="Resume"
          path="/resume"
          page={resume.data}
        />
      </ul>
    </section>
  );
}
