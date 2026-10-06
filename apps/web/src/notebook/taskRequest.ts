import type { CreateTaskRequest, NotebookArea } from '@gagnechris/app-core';
import type { TaskLineDraft } from '../kit/tasks/taskLine';

export function taskRequestFromDraft(
  id: string,
  draft: TaskLineDraft,
  { area, noteId }: { area: NotebookArea; noteId?: string },
): CreateTaskRequest {
  return {
    id,
    area,
    title: draft.title,
    description: '',
    priority: draft.priority,
    status: 'todo',
    startDate: draft.startDate,
    someday: draft.someday,
    dueDate: draft.dueDate,
    ...(noteId ? { noteId } : {}),
    tags: [],
  };
}
