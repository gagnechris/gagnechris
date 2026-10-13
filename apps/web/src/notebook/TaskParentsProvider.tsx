import type { ReactNode } from 'react';
import { useTaskParents } from '@gagnechris/app-core';
import { TaskParentsContext } from '../kit/tasks/taskParents';

/** Reads the parents of `tasks` in one request, for their rows' labels. */
export function TaskParentsProvider({
  tasks,
  children,
}: {
  tasks: readonly { parentId?: string | null }[];
  children: ReactNode;
}) {
  const parents = useTaskParents(tasks);
  return (
    <TaskParentsContext.Provider value={parents}>
      {children}
    </TaskParentsContext.Provider>
  );
}
