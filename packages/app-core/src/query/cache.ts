import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Home, Note, Post, Project, Resume, Task } from './api.js';
import { queryKeys } from './keys.js';

export const preferNewerByVersion = <T extends { version: number }>(
  prev: T | undefined,
  next: T,
): T => {
  if (prev !== undefined && prev.version > next.version) return prev;
  return next;
};

type Paged<T> = InfiniteData<{ items: T[] }, string | undefined>;

type ListMatch = boolean | undefined;

const upsertInPages = <T extends { id: string; version: number }>(
  prev: Paged<T> | undefined,
  entity: T,
  { removed, matches }: { removed: boolean; matches: ListMatch },
): Paged<T> | undefined => {
  const exists =
    prev?.pages.some((page) => page.items.some((x) => x.id === entity.id)) ??
    false;

  if (removed || (exists && matches === false)) {
    if (!prev || !exists) return prev;
    return {
      ...prev,
      pages: prev.pages.map((page) => ({
        ...page,
        items: page.items.filter((x) => x.id !== entity.id),
      })),
    };
  }

  if (exists) {
    return {
      ...prev!,
      pages: prev!.pages.map((page) => {
        const index = page.items.findIndex((x) => x.id === entity.id);
        if (index === -1) return page;
        const items = [...page.items];
        items[index] = preferNewerByVersion(page.items[index], entity);
        return { ...page, items };
      }),
    };
  }

  if (matches !== true) return prev;
  if (!prev || prev.pages.length === 0) {
    return {
      ...prev,
      pages: [{ items: [entity] }],
      pageParams: prev?.pageParams.length ? prev.pageParams : [undefined],
    };
  }
  const [first, ...rest] = prev.pages;
  return {
    ...prev,
    pages: [{ ...first, items: [entity, ...first.items] }, ...rest],
  };
};

const listFilters = (key: readonly unknown[]): Record<string, unknown> => {
  const last = key[key.length - 1];
  return last && typeof last === 'object'
    ? (last as Record<string, unknown>)
    : {};
};

const isInfinite = (data: unknown): boolean =>
  Boolean(data) && Array.isArray((data as { pages?: unknown }).pages);

const postMatches = (
  post: Post,
  filters: Record<string, unknown>,
): ListMatch => {
  if (filters.q) return undefined;
  if (filters.status !== undefined && filters.status !== post.status) {
    return false;
  }
  return true;
};

/** `seedUnfiltered` writes the unfiltered list even before its first fetch, so a create shows up immediately. */
const upsertIntoListCaches = <T extends { id: string; version: number }>(
  queryClient: QueryClient,
  listKey: readonly unknown[],
  entity: T,
  {
    removed,
    matches,
    seedUnfiltered = false,
  }: {
    removed: boolean;
    matches: (entity: T, filters: Record<string, unknown>) => ListMatch;
    seedUnfiltered?: boolean;
  },
): void => {
  if (seedUnfiltered) {
    queryClient.setQueryData<Paged<T>>(listKey, (prev) =>
      upsertInPages(prev, entity, { removed, matches: matches(entity, {}) }),
    );
  }
  for (const [key, data] of queryClient.getQueriesData<Paged<T>>({
    queryKey: listKey,
  })) {
    if (seedUnfiltered && key.length === listKey.length) continue;
    if (!isInfinite(data)) continue;
    queryClient.setQueryData<Paged<T>>(
      key,
      upsertInPages(data, entity, {
        removed,
        matches: matches(entity, listFilters(key)),
      }),
    );
  }
};

export const setCachedPost = (queryClient: QueryClient, post: Post): void => {
  queryClient.setQueryData<Post>(queryKeys.posts.detail(post.id), (prev) =>
    preferNewerByVersion(prev, post),
  );
  upsertIntoListCaches(queryClient, queryKeys.posts.list(), post, {
    removed: post.status === 'deleted',
    matches: postMatches,
    seedUnfiltered: true,
  });
};

export const setCachedProject = (
  queryClient: QueryClient,
  project: Project,
): void => {
  queryClient.setQueryData<Project>(
    queryKeys.projects.detail(project.id),
    (prev) => preferNewerByVersion(prev, project),
  );
  // An unfetched list stays unfetched: seeding it with one row would hide the rest.
  queryClient.setQueryData<Project[]>(queryKeys.projects.list(), (prev) => {
    if (!prev) return prev;
    if (project.status === 'deleted') {
      return prev.filter((p) => p.id !== project.id);
    }
    const index = prev.findIndex((p) => p.id === project.id);
    if (index === -1) return [...prev, project];
    const next = [...prev];
    next[index] = preferNewerByVersion(prev[index], project);
    return next;
  });
};

export const setCachedHome = (queryClient: QueryClient, home: Home): void => {
  queryClient.setQueryData<Home>(queryKeys.home(), (prev) =>
    preferNewerByVersion(prev, home),
  );
};

export const setCachedResume = (
  queryClient: QueryClient,
  resume: Resume,
): void => {
  queryClient.setQueryData<Resume>(queryKeys.resume(), (prev) =>
    preferNewerByVersion(prev, resume),
  );
};

const noteMatches = (
  note: Note,
  filters: Record<string, unknown>,
): ListMatch => {
  if (filters.q) return undefined;
  if (filters.area !== undefined && filters.area !== note.area) return false;
  if (filters.type !== undefined && filters.type !== note.type) return false;
  const from = typeof filters.from === 'string' ? filters.from : undefined;
  const to = typeof filters.to === 'string' ? filters.to : undefined;
  if (from !== undefined || to !== undefined) {
    if (note.type !== 'daily' || !note.date) return false;
    if (from !== undefined && note.date < from) return false;
    if (to !== undefined && note.date > to) return false;
  }
  return true;
};

export const setCachedNote = (queryClient: QueryClient, note: Note): void => {
  queryClient.setQueryData<Note>(queryKeys.notes.detail(note.id), (prev) =>
    preferNewerByVersion(prev, note),
  );
  if (note.type === 'daily' && note.date) {
    const dailyKey = queryKeys.notes.daily(note.area, note.date);
    if (note.deleted) {
      // The day's key must fall back to the server's fresh placeholder; a
      // tombstone there would outrank it by version and every save would 409.
      if (queryClient.getQueryData<Note>(dailyKey)?.id === note.id) {
        queryClient.removeQueries({ queryKey: dailyKey, exact: true });
      }
    } else {
      queryClient.setQueryData<Note>(dailyKey, (prev) =>
        preferNewerByVersion(prev, note),
      );
    }
    for (const [key, data] of queryClient.getQueriesData<Set<string>>({
      queryKey: [...queryKeys.notes.all, 'daily-dates'],
    })) {
      if (!(data instanceof Set)) continue;
      const [area, from, to] = key.slice(-3) as [string, string, string];
      if (area !== 'all' && area !== note.area) continue;
      if (note.date < from || note.date > to) continue;
      const next = new Set(data);
      if (note.deleted) next.delete(note.date);
      else next.add(note.date);
      queryClient.setQueryData(key, next);
    }
  }
  upsertIntoListCaches(queryClient, queryKeys.notes.list(), note, {
    removed: note.deleted,
    matches: noteMatches,
  });
};

const taskMatches = (
  task: Task,
  filters: Record<string, unknown>,
): ListMatch => {
  if (filters.area !== undefined && filters.area !== task.area) return false;
  if (filters.status !== undefined) {
    if (filters.status !== task.status) return false;
  } else if (filters.open === true && task.status === 'done') {
    return false;
  } else if (filters.open === false && task.status !== 'done') {
    return false;
  }
  if (filters.priority !== undefined && filters.priority !== task.priority) {
    return false;
  }
  if (filters.noteId !== undefined && filters.noteId !== task.noteId) {
    return false;
  }
  if (filters.dueOn !== undefined && filters.dueOn !== task.dueDate) {
    return false;
  }
  if (
    typeof filters.dueBefore === 'string' &&
    (task.dueDate === null || task.dueDate >= filters.dueBefore)
  ) {
    return false;
  }
  return true;
};

export const setCachedTask = (queryClient: QueryClient, task: Task): void => {
  queryClient.setQueryData<Task>(queryKeys.tasks.detail(task.id), (prev) =>
    preferNewerByVersion(prev, task),
  );
  upsertIntoListCaches(queryClient, queryKeys.tasks.list(), task, {
    removed: task.deleted,
    matches: taskMatches,
  });
};
