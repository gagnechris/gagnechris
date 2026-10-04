import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';
import { coldLoadedNotFound } from '../prerender/notFoundPrerender';
import NotFound from './NotFound';

type ProjectsPage = { title: string; html: string };
type Loaded = { pathname: string; page: ProjectsPage | null };

const coldLoadPath: string | null =
  typeof window === 'undefined' ? null : window.location.pathname;

/** Local Vite uses `/__site` → static origin; prod is same-origin. */
const pageUrl = (pathname: string): string => {
  const path = `${pathname.replace(/\/+$/, '')}/`;
  return import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim()
    ? `/__site${path}`
    : path;
};

const parsePage = (root: ParentNode): ProjectsPage | null => {
  const main = root.querySelector('main.projects-page, main.project-page');
  if (!main) return null;
  const heading = main.querySelector('h1')?.textContent?.trim() || 'Projects';
  return { title: `${heading} - Chris Gagne`, html: main.outerHTML };
};

/**
 * Shows the publisher's `/projects` prerender (already sanitized at publish)
 * so the SPA mount does not replace it with the 404. A stand-in until the
 * projects index and page are React components.
 */
function ProjectsPrerendered() {
  const { pathname } = useLocation();
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    if (coldLoadedNotFound(pathname)) return { pathname, page: null };
    if (pathname !== coldLoadPath) return null;
    const page = fromPrerender(parsePage);
    return page ? { pathname, page } : null;
  });
  const loadedPath = loaded?.pathname;

  useEffect(() => {
    if (loadedPath === pathname) return;
    let cancelled = false;
    void fetchPrerender(pageUrl(pathname), parsePage)
      .catch(() => null)
      .then((page) => {
        if (!cancelled) setLoaded({ pathname, page });
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, loadedPath]);

  if (loaded?.pathname !== pathname) return null;
  if (!loaded.page) return <NotFound />;
  return (
    <>
      <title>{loaded.page.title}</title>
      <div
        className="projects-prerendered"
        dangerouslySetInnerHTML={{ __html: loaded.page.html }}
      />
    </>
  );
}

export default ProjectsPrerendered;
