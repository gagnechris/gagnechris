import { Link } from 'react-router-dom';
import { homeResource, resumeResource } from '@gagnechris/app-core';
import { StatusBadge } from '@gagnechris/ui';

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
    <Link to={to} className="kit-list__item kit-list__link">
      <span className="kit-list__title">{title}</span>
      <span className="kit-list__meta">
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
    <section className="workspace-panel">
      <div className="workspace-panel__header">
        <div>
          <h1>Pages</h1>
          <p className="workspace-panel__lede">
            Everything on gagnechris.com besides posts and projects.
          </p>
        </div>
      </div>
      {failed ? (
        <p className="workspace-panel__error" role="alert">
          Could not load page status.
        </p>
      ) : null}
      <ul className="kit-list" aria-label="Site pages">
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
