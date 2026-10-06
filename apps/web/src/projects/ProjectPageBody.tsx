import { Fragment } from 'react';
import {
  formatPostDate,
  postDateAttribute,
  PROJECT_BUILD_LOG_HEADING,
  PROJECT_BUILD_LOG_ID,
  PROJECT_BUILD_LOG_RSS_LINK,
  projectBuildLogEmptyText,
  PROJECTS_PATH,
  projectStageText,
  type ProjectBuildLogPost,
  type ProjectPageView,
} from '@gagnechris/shared';
import { PROJECTS_INDEX_TITLE } from '@gagnechris/shared/render';
import SiteLink from '../components/SiteLink';
import ProjectDemoSlot from './ProjectDemoSlot';
import './ProjectStage.css';

// Markup must match `renderProjectPageBodyHtml` (ProjectPageBody.test.tsx).

const BuildLogEntry = ({ post }: { post: ProjectBuildLogPost }) => {
  const date = formatPostDate(post.publishedAt);
  const attr = postDateAttribute(post.publishedAt);
  return (
    <li className="project-build-log__entry" data-id={post.id}>
      <SiteLink
        className="project-build-log__link"
        href={`/posts/${post.slug}`}
      >
        <h3 className="project-build-log__title">{post.title}</h3>
        {date ? (
          <time
            className="project-build-log__date"
            dateTime={attr || undefined}
          >
            {date}
          </time>
        ) : null}
      </SiteLink>
    </li>
  );
};

const ProjectLink = ({ label, url }: ProjectPageView['links'][number]) => (
  <SiteLink href={url}>{label}</SiteLink>
);

const ProjectPageBody = ({ project }: { project: ProjectPageView }) => (
  <div
    className="project-page"
    data-slug={project.slug}
    data-demo={project.demo ?? undefined}
  >
    <header className="project-header">
      <p className="project-back">
        <SiteLink href={PROJECTS_PATH}>{PROJECTS_INDEX_TITLE}</SiteLink>
      </p>
      <p className="project-stage" data-stage={project.stage}>
        {projectStageText(project)}
      </p>
      <h1>{project.name}</h1>
      {project.pitch ? <p className="project-pitch">{project.pitch}</p> : null}
    </header>
    {project.demo ? <ProjectDemoSlot project={project} /> : null}
    <main className="project-main">
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
              <ProjectLink {...link} />
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
    </main>
  </div>
);

export default ProjectPageBody;
