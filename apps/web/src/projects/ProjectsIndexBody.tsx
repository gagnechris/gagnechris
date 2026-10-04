import {
  PROJECTS_INDEX_EMPTY_TEXT,
  PROJECTS_INDEX_INTRO,
  type ProjectCardView,
} from '@gagnechris/shared';
import { PROJECTS_INDEX_TITLE } from '@gagnechris/shared/render';
import ProjectCard from './ProjectCard';

// Markup must match `renderProjectsIndexBodyHtml` (ProjectCard.test.tsx).

const ProjectsIndexBody = ({
  projects,
  message,
}: {
  /** Already in display order. */
  projects: readonly ProjectCardView[];
  /** Replaces the list while loading or after an error. */
  message?: string;
}) => (
  <div className="projects-index">
    <header className="projects-index__header">
      <h1>{PROJECTS_INDEX_TITLE}</h1>
      <p className="projects-index__intro">{PROJECTS_INDEX_INTRO}</p>
    </header>
    <main>
      {message || !projects.length ? (
        <p className="projects-index__empty">
          {message ?? PROJECTS_INDEX_EMPTY_TEXT}
        </p>
      ) : (
        <ul className="project-list">
          {projects.map((card) => (
            <ProjectCard key={card.id} card={card} heading="h2" />
          ))}
        </ul>
      )}
    </main>
  </div>
);

export default ProjectsIndexBody;
