import type { Task } from '@gagnechris/app-core';
import type { TaskPriority, TaskStatus } from '@gagnechris/shared';

export type TaskDraft = {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  noteId: string;
  tagsText: string;
};

export const emptyTaskDraft = (): TaskDraft => ({
  title: '',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: '',
  noteId: '',
  tagsText: '',
});

export const taskDraftFromTask = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description,
  priority: task.priority,
  status: task.status,
  dueDate: task.dueDate ?? '',
  noteId: task.noteId ?? '',
  tagsText: task.tags.join(', '),
});

export const parseTagsText = (tagsText: string): string[] =>
  tagsText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

export const taskPayloadFromDraft = (draft: TaskDraft) => ({
  title: draft.title.trim() || 'Untitled',
  description: draft.description,
  priority: draft.priority,
  status: draft.status,
  dueDate: draft.dueDate.trim() ? draft.dueDate.trim() : null,
  noteId: draft.noteId.trim() ? draft.noteId.trim() : null,
  tags: parseTagsText(draft.tagsText),
});
