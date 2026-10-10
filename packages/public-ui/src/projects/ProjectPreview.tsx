/** @jsxRuntime automatic */
import {
  PROJECT_IDEA_PREVIEW_TEXT,
  PROJECT_MINI_UI,
  PROJECT_PREVIEW_HEIGHT,
  PROJECT_PREVIEW_WIDTH,
  projectPreview,
  type ProjectCardView,
  type ProjectMiniNode,
} from '@gagnechris/shared';

const Mini = ({ nodes }: { nodes: readonly ProjectMiniNode[] }) =>
  nodes.map(({ className, text, children }, i) => (
    <span key={i} className={className}>
      {text}
      {children ? <Mini nodes={children} /> : null}
    </span>
  ));

export const ProjectPreview = ({
  card,
  loading,
}: {
  card: Pick<ProjectCardView, 'previewImage' | 'stage' | 'demo'>;
  loading?: 'lazy';
}) => {
  const preview = projectPreview(card);
  switch (preview.kind) {
    case 'image':
      return (
        <div className="project-preview project-preview--image">
          <img
            alt=""
            width={PROJECT_PREVIEW_WIDTH}
            height={PROJECT_PREVIEW_HEIGHT}
            loading={loading}
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
