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
};
