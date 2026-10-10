/** @jsxRuntime automatic */
import { Fragment } from 'react';
import { projectStageText, type ProjectCardView } from '@gagnechris/shared';
import { PublicLink } from '../link.js';
import { ProjectPreview } from './ProjectPreview.js';

/** `projectCardsFromList` in the app reads this back on a cold load. */
export const ProjectCard = ({
  card,
  heading: Heading,
}: {
  card: ProjectCardView;
  heading: 'h2' | 'h3';
}) => {
  const inner = (
    <>
      {/* Lazy: otherwise the server renderer puts a preload <link> for each
          image inside #root, which hydration doesn't expect. */}
      <ProjectPreview card={card} loading="lazy" />
      <div className="project-card__text">
        <p className="project-stage" data-stage={card.stage}>
          {projectStageText(card)}
        </p>
        <Heading className="project-card__name">{card.name}</Heading>
        {card.pitch ? (
          <p className="project-card__pitch">{card.pitch}</p>
        ) : null}
        {card.stack.length ? (
          <p className="project-card__stack">
            {card.stack.map((item, i) => (
              <Fragment key={i}>
                {i > 0 ? ' · ' : null}
                <span>{item}</span>
              </Fragment>
            ))}
          </p>
        ) : null}
      </div>
    </>
  );
  return (
    <li
      className="project-card"
      data-id={card.id}
      data-slug={card.slug}
      data-demo={card.demo ?? undefined}
    >
      {card.href ? (
        <PublicLink className="project-card__link" href={card.href}>
          {inner}
        </PublicLink>
      ) : (
        <div className="project-card__link">{inner}</div>
      )}
    </li>
  );
};
