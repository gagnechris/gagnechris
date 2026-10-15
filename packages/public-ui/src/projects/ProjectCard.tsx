/** @jsxRuntime automatic */
import { Fragment } from 'react';
import { projectStageText, type ProjectCardView } from '@gagnechris/shared';
import { Card } from '@gagnechris/ui';
import { PublicLink } from '../link.js';
import { ProjectPreview } from './ProjectPreview.js';

/** `projectCardsFromList` in the app reads this back on a cold load. */
export const ProjectCard = ({
  card,
  heading,
}: {
  card: ProjectCardView;
  heading: 'h2' | 'h3';
}) => (
  <Card
    tone="editorial"
    as="li"
    className="project-card"
    data-id={card.id}
    data-slug={card.slug}
    data-demo={card.demo ?? undefined}
    headingLevel={heading === 'h2' ? 2 : 3}
    href={card.href ?? undefined}
    linkAs={PublicLink}
    // Lazy: otherwise the server renderer puts a preload <link> for each
    // image inside #root, which hydration doesn't expect.
    preview={<ProjectPreview card={card} loading="lazy" />}
    kicker={
      <p className="project-stage" data-stage={card.stage}>
        {projectStageText(card)}
      </p>
    }
    title={card.name}
  >
    {card.pitch ? <p className="project-card__pitch">{card.pitch}</p> : null}
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
  </Card>
);
