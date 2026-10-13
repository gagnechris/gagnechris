import { useContext } from 'react';
import { TaskParentsContext } from './taskParents';

/** A subtask's parent title, small above its own; muted once the parent is finished. */
export function TaskParentLabel({ parentId }: { parentId?: string | null }) {
  const parent = useContext(TaskParentsContext).get(parentId ?? '');
  if (!parent) return null;
  const finished = parent.status === 'done' || parent.status === 'dropped';
  return (
    <span
      className={`task-parent-label${finished ? ' task-parent-label--finished' : ''}`}
    >
      {parent.title}
    </span>
  );
}
