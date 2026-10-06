import { Fragment } from 'react';
import { projectStageText, type ProjectCardView } from '@gagnechris/shared';
import SiteLink from '../components/SiteLink';
import ProjectPreview from './ProjectPreview';
import './ProjectCard.css';
import './ProjectStage.css';

// Markup must match `renderProjectCardHtml` element for element
// (ProjectCard.test.tsx).

const ProjectCard = ({
  card,
  heading: Heading,
}: {
  card: ProjectCardView;
  heading: 'h2' | 'h3';
}) => {
  const inner = (
    <>
      <ProjectPreview card={card} />
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
        <SiteLink className="project-card__link" href={card.href}>
          {inner}
        </SiteLink>
      ) : (
        <div className="project-card__link">{inner}</div>
      )}
    </li>
  );
};

export default ProjectCard;
