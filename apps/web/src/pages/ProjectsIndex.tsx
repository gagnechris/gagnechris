import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { pageTitle, type ProjectCardView } from '@gagnechris/shared';
import ProjectsIndexBody from '../projects/ProjectsIndexBody';
import {
  documentProjectsIndex,
  loadPublishedProjects,
} from '../projects/publishedProjects';
import { coldLoadedNotFound } from '../prerender/notFoundPrerender';
import NotFound from './NotFound';
import './ProjectsIndex.css';
import PageHead from '../components/PageHead';

function ProjectsIndex() {
  const { pathname } = useLocation();
  const notFound = coldLoadedNotFound(pathname);
  const [projects, setProjects] = useState<ProjectCardView[] | null>(
    documentProjectsIndex,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (notFound || documentProjectsIndex()) return;
    let cancelled = false;
    loadPublishedProjects()
      .then((items) => {
        if (!cancelled) setProjects(items ?? []);
      })
      .catch((err: unknown) => {
        console.error('Error loading projects:', err);
        if (!cancelled) {
          setError('Could not load projects.');
          setProjects([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [notFound]);

  if (notFound) return <NotFound />;
  return (
    <>
      <PageHead
        title={pageTitle('Projects')}
        url="https://gagnechris.com/projects"
      />
      <ProjectsIndexBody
        projects={projects ?? []}
        message={error ?? (projects ? undefined : 'Loading projects…')}
      />
    </>
  );
}

export default ProjectsIndex;
