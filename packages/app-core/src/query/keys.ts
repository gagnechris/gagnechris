/**
 * Query-key factories for admin data (UI-free).
 * Room left for notes / tasks / today under the same `admin` prefix.
 */
export const queryKeys = {
  posts: {
    all: ['admin', 'posts'] as const,
    /** Optional filters reserved for Notebook/task list UIs (CHR-158). */
    list: (filters?: { status?: string; q?: string }) =>
      filters
        ? ([...queryKeys.posts.all, 'list', filters] as const)
        : ([...queryKeys.posts.all, 'list'] as const),
    detail: (id: string) => [...queryKeys.posts.all, 'detail', id] as const,
  },
  home: () => ['admin', 'home'] as const,
  resume: () => ['admin', 'resume'] as const,
  notes: {
    all: ['admin', 'notebook', 'notes'] as const,
    list: (filters?: {
      area?: 'work' | 'personal';
      type?: 'daily' | 'page';
      from?: string;
      to?: string;
      q?: string;
    }) =>
      filters
        ? ([...queryKeys.notes.all, 'list', filters] as const)
        : ([...queryKeys.notes.all, 'list'] as const),
    detail: (id: string) => [...queryKeys.notes.all, 'detail', id] as const,
    daily: (area: 'work' | 'personal', date: string) =>
      [...queryKeys.notes.all, 'daily', area, date] as const,
    /** Calendar dots — `Set<string>` of dates, not infinite list pages. */
    dailyDates: (
      area: 'work' | 'personal' | undefined,
      from: string,
      to: string,
    ) =>
      [...queryKeys.notes.all, 'daily-dates', area ?? 'all', from, to] as const,
  },
  tasks: {
    all: ['admin', 'notebook', 'tasks'] as const,
    list: (filters?: {
      area?: 'work' | 'personal';
      status?: 'todo' | 'in_progress' | 'done';
      priority?: 'low' | 'med' | 'high';
      dueOn?: string;
      dueBefore?: string;
      noteId?: string;
    }) =>
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
