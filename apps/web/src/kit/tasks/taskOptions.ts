import type { TaskPriority, TaskStatus } from '@gagnechris/shared';

export const TASK_STATUS_OPTIONS: readonly {
  value: TaskStatus;
  label: string;
}[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
];

export const TASK_PRIORITY_OPTIONS: readonly {
  value: TaskPriority;
  label: string;
}[] = [
  { value: 'high', label: 'High' },
  { value: 'med', label: 'Med' },
  { value: 'low', label: 'Low' },
];
