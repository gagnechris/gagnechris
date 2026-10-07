import { useParams } from 'react-router-dom';
import { pageTitle, projectPagePath, siteUrl } from '@gagnechris/shared';
import ProjectPageBody from '../projects/ProjectPageBody';
import {
  documentProjectPageView,
  loadPublishedProject,
} from '../projects/publishedProject';
import { usePublishedView } from '../prerender/usePublishedView';
import NotFound from './NotFound';
import './PostPage.css';
import './ProjectPage.css';
import PageHead from '../components/PageHead';

function ProjectPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const published = usePublishedView(
    slug,
    documentProjectPageView,
    loadPublishedProject,
  );

  if (!slug.trim() || published.status === 'missing') return <NotFound />;

  if (published.status !== 'ready') {
    return (
      <main className="project-page">
        {published.status === 'error' ? (
          <p className="project-loading" role="alert">
            Could not load this project. Check your connection and try again.
          </p>
        ) : (
          <p className="project-loading">Loading project…</p>
        )}
      </main>
    );
  }

  const project = published.view;
  return (
    <>
      <PageHead
        title={pageTitle(project.name)}
        url={siteUrl(projectPagePath(slug))}
      />
      <ProjectPageBody project={project} />
    </>
  );
}

export default ProjectPage;
