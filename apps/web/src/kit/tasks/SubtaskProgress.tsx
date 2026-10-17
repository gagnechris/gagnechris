import { Chip } from '@gagnechris/ui';
import type { TaskEmbedSubtasks } from './TaskEmbedRow';

const RING = 2 * Math.PI * 6;

export function SubtaskProgress({ subtasks }: { subtasks: TaskEmbedSubtasks }) {
  const { done, total, folded, onToggleFold } = subtasks;
  return (
    <Chip
      className="task-embed__progress"
      aria-expanded={!folded}
      aria-label={`${done} of ${total} subtasks done`}
      title={folded ? 'Show subtasks' : 'Hide subtasks'}
      onClick={onToggleFold}
      icon={
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle className="task-embed__ring-track" cx="8" cy="8" r="6" />
          <circle
            className="task-embed__ring"
            cx="8"
            cy="8"
            r="6"
            strokeDasharray={`${(RING * done) / total} ${RING}`}
            transform="rotate(-90 8 8)"
          />
        </svg>
      }
    >
      {done} of {total}
    </Chip>
  );
}
