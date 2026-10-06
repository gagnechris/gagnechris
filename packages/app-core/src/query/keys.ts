/** Query-key factories for admin data (UI-free). */
import type { ListNotesQuery, ListTasksQuery } from './api.js';

export const queryKeys = {
  posts: {
    all: ['admin', 'posts'] as const,
    list: (filters?: { status?: string; q?: string }) =>
      filters
        ? ([...queryKeys.posts.all, 'list', filters] as const)
        : ([...queryKeys.posts.all, 'list'] as const),
    detail: (id: string) => [...queryKeys.posts.all, 'detail', id] as const,
  },
  projects: {
    all: ['admin', 'projects'] as const,
    list: () => [...queryKeys.projects.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.projects.all, 'detail', id] as const,
  },
  home: () => ['admin', 'home'] as const,
  users: {
    all: ['admin', 'users'] as const,
    list: () => [...queryKeys.users.all, 'list'] as const,
  },
  resume: () => ['admin', 'resume'] as const,
  notes: {
    all: ['admin', 'notebook', 'notes'] as const,
    list: (filters?: Omit<ListNotesQuery, 'cursor'> & { q?: string }) =>
      filters
        ? ([...queryKeys.notes.all, 'list', filters] as const)
        : ([...queryKeys.notes.all, 'list'] as const),
    detail: (id: string) => [...queryKeys.notes.all, 'detail', id] as const,
    daily: (area: 'work' | 'personal', date: string) =>
      [...queryKeys.notes.all, 'daily', area, date] as const,
    dailyDates: (
      area: 'work' | 'personal' | undefined,
      from: string,
      to: string,
    ) =>
      [...queryKeys.notes.all, 'daily-dates', area ?? 'all', from, to] as const,
  },
  tasks: {
    all: ['admin', 'notebook', 'tasks'] as const,
    list: (filters?: Omit<ListTasksQuery, 'cursor'>) =>
      filters
        ? ([...queryKeys.tasks.all, 'list', filters] as const)
        : ([...queryKeys.tasks.all, 'list'] as const),
    detail: (id: string) => [...queryKeys.tasks.all, 'detail', id] as const,
  },
  search: (filters: {
    q: string;
    area?: 'work' | 'personal';
    limit?: number;
  }) => ['admin', 'notebook', 'search', filters] as const,
};
