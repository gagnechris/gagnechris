import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  PROJECT_DEMO_LABEL,
  PROJECT_DEMO_LABEL_ID,
  type ProjectPageView,
} from '@gagnechris/shared';
import ProjectPreview from './ProjectPreview';
import { PROJECT_DEMO_LOADERS, type ProjectDemoProps } from './demoLoaders';

type Loaded = { slug: string; Demo: ComponentType<ProjectDemoProps> };

/** Starts loading this far before the slot scrolls into view. */
const PRELOAD_MARGIN = '200px 0px';

/**
 * First renders the prerendered preview, so a cold load paints it once. The
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
    <section className="project-demo" aria-labelledby={PROJECT_DEMO_LABEL_ID}>
      <h2 className="project-demo__label" id={PROJECT_DEMO_LABEL_ID}>
        {PROJECT_DEMO_LABEL}
      </h2>
      <div
        className="project-demo__stage"
        ref={stageRef}
        onPointerDown={load && !wanted ? () => setWantedSlug(slug) : undefined}
      >
        {Demo ? <Demo project={project} /> : <ProjectPreview card={project} />}
      </div>
    </section>
  );
};

export default ProjectDemoSlot;
