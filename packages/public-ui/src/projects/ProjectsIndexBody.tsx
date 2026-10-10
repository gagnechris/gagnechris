/** @jsxRuntime automatic */
import {
  PROJECTS_INDEX_EMPTY_TEXT,
  PROJECTS_INDEX_INTRO,
  PROJECTS_INDEX_TITLE,
  type ProjectCardView,
} from '@gagnechris/shared';
import { ProjectCard } from './ProjectCard.js';

export const ProjectsIndexBody = ({
  projects,
  message,
}: {
  /** Already in display order. */
  projects: readonly ProjectCardView[];
  /** Replaces the list while loading or after an error. */
  message?: string;
}) => (
  <main className="projects-index">
    <header className="projects-index__header">
      <h1>{PROJECTS_INDEX_TITLE}</h1>
      <p className="projects-index__intro">{PROJECTS_INDEX_INTRO}</p>
    </header>
    <div className="projects-index__list">
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
    </div>
  </main>
);
