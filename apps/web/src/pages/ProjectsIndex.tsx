import { pageTitle, PROJECTS_PATH, siteUrl } from '@gagnechris/shared';
import { ProjectsIndexBody } from '@gagnechris/public-ui';
import {
  documentProjectsIndex,
  loadPublishedProjects,
} from '../projects/publishedProjects';
import { usePublishedView } from '../prerender/usePublishedView';
import NotFound from './NotFound';
import './ProjectsIndex.css';
import '../projects/ProjectCard.css';
import '../projects/ProjectStage.css';
import '../projects/ProjectPreview.css';
import PageHead from '../components/PageHead';

function ProjectsIndex() {
  const published = usePublishedView(
    'projects',
    documentProjectsIndex,
    loadPublishedProjects,
  );

  if (published.status === 'missing') return <NotFound />;
  return (
    <>
      <PageHead title={pageTitle('Projects')} url={siteUrl(PROJECTS_PATH)} />
      <ProjectsIndexBody
        projects={published.status === 'ready' ? published.view : []}
        message={
          published.status === 'loading'
            ? 'Loading projects…'
            : published.status === 'error'
              ? 'Could not load projects.'
              : undefined
        }
      />
    </>
  );
}

export default ProjectsIndex;
