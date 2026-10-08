import {
  parseTagsText,
  type NotebookArea,
  type TaskPriority,
  type TaskStatus,
} from '@gagnechris/shared';
import type { Task } from './api.js';

export type TaskDraft = {
  area: NotebookArea;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string;
  someday: boolean;
  dueDate: string;
  noteId: string;
  tagsText: string;
};

export const emptyTaskDraft = (): TaskDraft => ({
  area: 'work',
  title: '',
  description: '',
  priority: 'med',
  status: 'todo',
  startDate: '',
  someday: false,
  dueDate: '',
  noteId: '',
  tagsText: '',
});

export const taskDraftFromTask = (task: Task): TaskDraft => ({
  area: task.area,
  title: task.title,
  description: task.description,
  priority: task.priority,
  status: task.status,
  startDate: task.startDate ?? '',
  someday: task.someday,
  dueDate: task.dueDate ?? '',
  noteId: task.noteId ?? '',
  tagsText: task.tags.join(', '),
});

export const taskPayloadFromDraft = (draft: TaskDraft) => ({
  area: draft.area,
  title: draft.title.trim() || 'Untitled',
  description: draft.description,
  priority: draft.priority,
  status: draft.status,
  startDate:
    !draft.someday && draft.startDate.trim() ? draft.startDate.trim() : null,
  someday: draft.someday,
  dueDate: draft.dueDate.trim() ? draft.dueDate.trim() : null,
  noteId: draft.noteId.trim() ? draft.noteId.trim() : null,
  tags: parseTagsText(draft.tagsText),
});
