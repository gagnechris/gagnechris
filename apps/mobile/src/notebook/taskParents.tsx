import { useTaskParents, type Task } from '@gagnechris/app-core';
import { createContext, useContext, type ReactNode } from 'react';

export type TaskParent = Pick<Task, 'title' | 'status'>;

const TaskParentsContext = createContext<ReadonlyMap<string, TaskParent>>(
  new Map(),
);

/** Reads the parents of `tasks` in one request, for their rows' labels. */
export const TaskParentsProvider = ({
  tasks,
  children,
}: {
  tasks: readonly { parentId?: string | null }[];
  children: ReactNode;
}) => (
  <TaskParentsContext.Provider value={useTaskParents(tasks)}>
    {children}
  </TaskParentsContext.Provider>
);

export const useTaskParent = (parentId: string | null | undefined) =>
  useContext(TaskParentsContext).get(parentId ?? '');

export const isOpenStatus = (status: Task['status']) =>
  status === 'todo' || status === 'in_progress';
