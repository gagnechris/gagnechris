import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { ProjectPageView } from '@gagnechris/shared';
import { ProjectDemoPreview, ProjectDemoSection } from '@gagnechris/public-ui';
import { PROJECT_DEMO_LOADERS, type ProjectDemoProps } from './demoLoaders';
import './ProjectPreview.css';

type Loaded = { slug: string; Demo: ComponentType<ProjectDemoProps> };

/** Starts loading this far before the slot scrolls into view. */
const PRELOAD_MARGIN = '200px 0px';

/**
 * First renders the published preview, so a cold load hydrates it. The
 * demo's chunk is fetched only when the slot nears the viewport or is
 * clicked, then replaces the preview.
 */
const ProjectDemoSlot = ({ project }: { project: ProjectPageView }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [wantedSlug, setWantedSlug] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const load = project.demo ? PROJECT_DEMO_LOADERS[project.demo] : undefined;
  const { slug } = project;
  const wanted = Boolean(load) && wantedSlug === slug;

  useEffect(() => {
    if (!load || wanted) return;
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === 'undefined') {
      setWantedSlug(slug);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setWantedSlug(slug);
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [load, wanted, slug]);

  useEffect(() => {
    if (!load || !wanted) return;
    let cancelled = false;
    load()
      .then(({ default: Demo }) => {
        if (!cancelled) setLoaded({ slug, Demo });
      })
      .catch((err: unknown) => {
        console.error('Error loading the demo:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [load, wanted, slug]);

  const Demo = loaded?.slug === slug ? loaded.Demo : null;
  return (
    <ProjectDemoSection
      stageRef={stageRef}
      onPointerDown={load && !wanted ? () => setWantedSlug(slug) : undefined}
    >
      {Demo ? (
        <Demo project={project} />
      ) : (
        <ProjectDemoPreview project={project} />
      )}
    </ProjectDemoSection>
  );
};

export default ProjectDemoSlot;
