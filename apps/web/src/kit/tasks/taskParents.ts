import { createContext } from 'react';
import type { Task } from '@gagnechris/shared';

export type TaskParent = Pick<Task, 'title' | 'status'>;

/** The parents of the tasks a list shows, by id. */
export const TaskParentsContext = createContext<
  ReadonlyMap<string, TaskParent>
>(new Map());
