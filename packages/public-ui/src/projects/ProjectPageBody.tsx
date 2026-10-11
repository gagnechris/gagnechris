/** @jsxRuntime automatic */
import { Fragment, type ReactNode, type Ref } from 'react';
import {
  formatPostDate,
  postDateAttribute,
  PROJECT_BUILD_LOG_HEADING,
  PROJECT_BUILD_LOG_ID,
  PROJECT_BUILD_LOG_RSS_LINK,
  PROJECT_DEMO_LABEL,
  PROJECT_DEMO_LABEL_ID,
  projectBuildLogEmptyText,
  PROJECTS_INDEX_TITLE,
  PROJECTS_PATH,
  projectStageText,
  type ProjectBuildLogPost,
  type ProjectPageView,
} from '@gagnechris/shared';
import { PublicLink } from '../link.js';
import { ProjectPreview } from './ProjectPreview.js';

/**
 * The Try it slot's preview. Low priority, or the server renderer would put
 * an image preload inside `#root`; the app swaps in the demo soon anyway.
 */
export const ProjectDemoPreview = ({
  project,
}: {
  project: Pick<ProjectPageView, 'previewImage' | 'stage' | 'demo'>;
}) => <ProjectPreview card={project} fetchPriority="low" />;

export const ProjectDemoSection = ({
  children,
  stageRef,
  onPointerDown,
}: {
  children: ReactNode;
  stageRef?: Ref<HTMLDivElement>;
  onPointerDown?: () => void;
}) => (
  <section className="project-demo" aria-labelledby={PROJECT_DEMO_LABEL_ID}>
    <h2 className="project-demo__label" id={PROJECT_DEMO_LABEL_ID}>
      {PROJECT_DEMO_LABEL}
    </h2>
    <div
      className="project-demo__stage"
      ref={stageRef}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  </section>
);

const BuildLogEntry = ({ post }: { post: ProjectBuildLogPost }) => {
  const date = formatPostDate(post.publishedAt);
  return (
    <li className="project-build-log__entry" data-id={post.id}>
      <PublicLink
        className="project-build-log__link"
        href={`/posts/${post.slug}`}
      >
        <h3 className="project-build-log__title">{post.title}</h3>
        {date ? (
          <time
            className="project-build-log__date"
            dateTime={postDateAttribute(post.publishedAt) || undefined}
          >
            {date}
          </time>
        ) : null}
      </PublicLink>
    </li>
  );
};

/**
 * `demoSlot` is what the app shows in the Try it slot; it must first render
 * what `ProjectDemoSection` with `ProjectDemoPreview` does.
 */
export const ProjectPageBody = ({
  project,
  demoSlot,
}: {
  project: ProjectPageView;
  demoSlot?: ReactNode;
}) => (
  <main
    className="project-page"
    data-slug={project.slug}
    data-demo={project.demo ?? undefined}
  >
    <header className="project-header">
      <p className="project-back">
        <PublicLink href={PROJECTS_PATH}>{PROJECTS_INDEX_TITLE}</PublicLink>
      </p>
      <p className="project-stage" data-stage={project.stage}>
        {projectStageText(project)}
      </p>
      <h1>{project.name}</h1>
      {project.pitch ? <p className="project-pitch">{project.pitch}</p> : null}
    </header>
    {project.demo
      ? (demoSlot ?? (
          <ProjectDemoSection>
            <ProjectDemoPreview project={project} />
          </ProjectDemoSection>
        ))
      : null}
    <div className="project-main">
      <div
        className="post-content project-body"
        dangerouslySetInnerHTML={{ __html: project.bodyHtml }}
      />
      {project.stack.length ? (
        <p className="project-stack">
          {project.stack.map((item, i) => (
            <Fragment key={i}>
              {i > 0 ? ' · ' : null}
              <span>{item}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
      {project.links.length ? (
        <ul className="project-links">
          {project.links.map((link, i) => (
            <li key={i}>
              <PublicLink href={link.url}>{link.label}</PublicLink>
            </li>
          ))}
        </ul>
      ) : null}
      <section
        className="project-build-log"
        aria-labelledby={PROJECT_BUILD_LOG_ID}
      >
        <h2 id={PROJECT_BUILD_LOG_ID}>{PROJECT_BUILD_LOG_HEADING}</h2>
        {project.buildLog.length ? (
          <ul className="project-build-log__list">
            {project.buildLog.map((post) => (
              <BuildLogEntry key={post.id} post={post} />
            ))}
          </ul>
        ) : (
          <p className="project-build-log__empty">
            {`${projectBuildLogEmptyText(project.name)} `}
            <a href={PROJECT_BUILD_LOG_RSS_LINK.href}>
              {PROJECT_BUILD_LOG_RSS_LINK.label}
            </a>
            .
          </p>
        )}
      </section>
    </div>
  </main>
);
