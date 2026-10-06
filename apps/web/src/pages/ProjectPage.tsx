import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { pageTitle, type ProjectPageView } from '@gagnechris/shared';
import ProjectPageBody from '../projects/ProjectPageBody';
import {
  documentProjectPageView,
  loadPublishedProject,
} from '../projects/publishedProject';
import { coldLoadedNotFound } from '../prerender/notFoundPrerender';
import NotFound from './NotFound';
import './PostPage.css';
import './ProjectPage.css';
import PageHead from '../components/PageHead';

type Loaded = { slug: string; project: ProjectPageView | null };

function ProjectPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { pathname } = useLocation();
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    if (coldLoadedNotFound(pathname)) return { slug, project: null };
    const project = slug ? documentProjectPageView(slug) : null;
    return project ? { slug, project } : null;
  });
  const loadedSlug = loaded?.slug;

  useEffect(() => {
    if (!slug.trim() || loadedSlug === slug) return;
    let cancelled = false;
    void loadPublishedProject(slug)
      .catch((err: unknown) => {
        console.error('Error loading project:', err);
        return null;
      })
      .then((project) => {
        if (!cancelled) setLoaded({ slug, project });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, loadedSlug]);

  if (!slug.trim()) return <NotFound />;

  const project = loaded?.slug === slug ? loaded.project : undefined;

  if (project === undefined) {
    return (
      <div className="project-page">
        <p className="project-loading">Loading project…</p>
      </div>
    );
  }

  if (!project) return <NotFound />;

  return (
    <>
      <PageHead
        title={pageTitle(project.name)}
        url={`https://gagnechris.com/projects/${slug}`}
      />
      <ProjectPageBody project={project} />
    </>
  );
}

export default ProjectPage;
