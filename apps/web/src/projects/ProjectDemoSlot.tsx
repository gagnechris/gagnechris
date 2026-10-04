import { useEffect, useState, type ComponentType } from 'react';
import {
  PROJECT_DEMO_LABEL,
  PROJECT_DEMO_LABEL_ID,
  type ProjectPageView,
} from '@gagnechris/shared';
import ProjectPreview from './ProjectPreview';
import { PROJECT_DEMO_LOADERS, type ProjectDemoProps } from './demoLoaders';

type Loaded = { slug: string; Demo: ComponentType<ProjectDemoProps> };

/** First renders the prerendered preview, so a cold load paints it once; the demo replaces it when its chunk arrives. */
const ProjectDemoSlot = ({ project }: { project: ProjectPageView }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const load = project.demo ? PROJECT_DEMO_LOADERS[project.demo] : undefined;
  const { slug } = project;

  useEffect(() => {
    if (!load) return;
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
  }, [load, slug]);

  const Demo = loaded?.slug === slug ? loaded.Demo : null;
  return (
    <section className="project-demo" aria-labelledby={PROJECT_DEMO_LABEL_ID}>
      <h2 className="project-demo__label" id={PROJECT_DEMO_LABEL_ID}>
        {PROJECT_DEMO_LABEL}
      </h2>
      <div className="project-demo__stage">
        {Demo ? <Demo project={project} /> : <ProjectPreview card={project} />}
      </div>
    </section>
  );
};

export default ProjectDemoSlot;
