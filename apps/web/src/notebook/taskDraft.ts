import type { Task } from '@gagnechris/app-core';
import type { TaskPriority, TaskStatus } from '@gagnechris/shared';
import { parseTagsText } from './noteDraft';

export type TaskDraft = {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string;
  someday: boolean;
  noteId: string;
  tagsText: string;
};

export const emptyTaskDraft = (): TaskDraft => ({
  title: '',
  description: '',
  priority: 'med',
  status: 'todo',
  startDate: '',
  someday: false,
  noteId: '',
  tagsText: '',
});

export const taskDraftFromTask = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description,
  priority: task.priority,
  status: task.status,
  startDate: task.startDate ?? '',
  someday: task.someday,
  noteId: task.noteId ?? '',
  tagsText: task.tags.join(', '),
});

export const taskPayloadFromDraft = (draft: TaskDraft) => ({
  title: draft.title.trim() || 'Untitled',
  description: draft.description,
  priority: draft.priority,
  status: draft.status,
  startDate:
    !draft.someday && draft.startDate.trim() ? draft.startDate.trim() : null,
  someday: draft.someday,
  noteId: draft.noteId.trim() ? draft.noteId.trim() : null,
  tags: parseTagsText(draft.tagsText),
});
