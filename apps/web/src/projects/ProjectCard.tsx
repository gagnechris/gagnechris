import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  PROJECT_IDEA_PREVIEW_TEXT,
  PROJECT_MINI_UI,
  PROJECT_PREVIEW_HEIGHT,
  PROJECT_PREVIEW_WIDTH,
  projectPreview,
  projectStageText,
  type ProjectCardView,
  type ProjectMiniNode,
} from '@gagnechris/shared';
import './ProjectCard.css';

// Markup must match `renderProjectCardHtml` element for element
// (ProjectCard.test.tsx).

const Mini = ({ nodes }: { nodes: readonly ProjectMiniNode[] }) =>
  nodes.map(({ className, text, children }, i) => (
    <span key={i} className={className}>
      {text}
      {children ? <Mini nodes={children} /> : null}
    </span>
  ));

const Preview = ({ card }: { card: ProjectCardView }) => {
  const preview = projectPreview(card);
  switch (preview.kind) {
    case 'image':
      return (
        <div className="project-preview project-preview--image">
          <img
            alt=""
            width={PROJECT_PREVIEW_WIDTH}
            height={PROJECT_PREVIEW_HEIGHT}
            src={preview.src}
          />
        </div>
      );
    case 'idea':
      return (
        <div
          className="project-preview project-preview--idea"
          aria-hidden="true"
        >
          {PROJECT_IDEA_PREVIEW_TEXT}
        </div>
      );
    case 'mini':
      return (
        <div
          className={`project-preview project-preview--${preview.mini}`}
          aria-hidden="true"
        >
          <Mini nodes={PROJECT_MINI_UI[preview.mini]} />
        </div>
      );
  }
};

const CardLink = ({ href, children }: { href: string; children: ReactNode }) =>
  href.startsWith('/') ? (
    <Link className="project-card__link" to={href} discover="none">
      {children}
    </Link>
  ) : (
    <a className="project-card__link" href={href}>
      {children}
    </a>
  );

const ProjectCard = ({
  card,
  heading: Heading,
}: {
  card: ProjectCardView;
  heading: 'h2' | 'h3';
}) => {
  const inner = (
    <>
      <Preview card={card} />
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
        <CardLink href={card.href}>{inner}</CardLink>
      ) : (
        <div className="project-card__link">{inner}</div>
      )}
    </li>
  );
};

export default ProjectCard;
