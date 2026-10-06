import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';
import {
  isOpenTaskStatus,
  postMatchesQuery,
  taskMatchesSchedule,
} from '@gagnechris/shared';
import type {
  Home,
  Note,
  Post,
  PostSummary,
  Project,
  Resume,
  Task,
} from './api.js';
import { queryKeys } from './keys.js';

export const preferNewerByVersion = <T extends { version: number }>(
  prev: T | undefined,
  next: T,
): T => {
  if (prev !== undefined && prev.version > next.version) return prev;
  return next;
};

/** Writes `entity` under `key` unless the cache already holds a newer version. */
export const setDetail = <T extends { version: number }>(
  queryClient: QueryClient,
  key: QueryKey,
  entity: T,
): void => {
  queryClient.setQueryData<T>(key, (prev) =>
    preferNewerByVersion(prev, entity),
  );
};

/** Replaces the item with the same id (through `merge`), or appends it. */
export const upsertById = <T extends { id: string }>(
  list: readonly T[],
  item: T,
  merge: (prev: T, next: T) => T = (_prev, next) => next,
): T[] => {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = merge(list[index]!, item);
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
  post: PostSummary,
  filters: Record<string, unknown>,
): ListMatch => {
  if (filters.status !== undefined && filters.status !== post.status) {
    return false;
  }
  return typeof filters.q === 'string'
    ? postMatchesQuery(post, filters.q)
    : true;
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

const toPostSummary = ({
  excerpt,
  bodyMarkdown,
  coverImage,
  seo,
  ...summary
}: Post): PostSummary => summary;

export const setCachedPost = (queryClient: QueryClient, post: Post): void => {
  const before = queryClient.getQueryData<Post>(
    queryKeys.posts.detail(post.id),
  );
  setDetail(queryClient, queryKeys.posts.detail(post.id), post);
  upsertIntoListCaches(
    queryClient,
    queryKeys.posts.list(),
    toPostSummary(post),
    {
      removed: post.status === 'deleted',
      matches: postMatches,
      seedUnfiltered: true,
    },
  );
  // Counts come from the server on the first page; refetch them next time a list mounts.
  if (before?.status !== post.status) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.posts.list(),
      refetchType: 'none',
    });
  }
};

export const setCachedProject = (
  queryClient: QueryClient,
  project: Project,
): void => {
  setDetail(queryClient, queryKeys.projects.detail(project.id), project);
  // An unfetched list stays unfetched: seeding it with one row would hide the rest.
  queryClient.setQueryData<Project[]>(queryKeys.projects.list(), (prev) => {
    if (!prev) return prev;
    if (project.status === 'deleted') {
      return prev.filter((p) => p.id !== project.id);
    }
    return upsertById(prev, project, preferNewerByVersion);
  });
};

export const setCachedHome = (queryClient: QueryClient, home: Home): void => {
  setDetail(queryClient, queryKeys.home(), home);
};

export const setCachedResume = (
  queryClient: QueryClient,
  resume: Resume,
): void => {
  setDetail(queryClient, queryKeys.resume(), resume);
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
  setDetail(queryClient, queryKeys.notes.detail(note.id), note);
  if (note.type === 'daily' && note.date) {
    const dailyKey = queryKeys.notes.daily(note.area, note.date);
    if (note.deleted) {
      // The day's key must fall back to the server's fresh placeholder; a
      // tombstone there would outrank it by version and every save would 409.
      if (queryClient.getQueryData<Note>(dailyKey)?.id === note.id) {
        queryClient.removeQueries({ queryKey: dailyKey, exact: true });
      }
    } else {
      setDetail(queryClient, dailyKey, note);
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
  } else if (filters.open === true && !isOpenTaskStatus(task.status)) {
    return false;
  } else if (filters.open === false && isOpenTaskStatus(task.status)) {
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
  return taskMatchesSchedule(task, {
    startOn: stringFilter(filters.startOn),
    startOnOrBefore: stringFilter(filters.startOnOrBefore),
    startAfter: stringFilter(filters.startAfter),
    someday: typeof filters.someday === 'boolean' ? filters.someday : undefined,
  });
};

const stringFilter = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const setCachedTask = (queryClient: QueryClient, task: Task): void => {
  setDetail(queryClient, queryKeys.tasks.detail(task.id), task);
  upsertIntoListCaches(queryClient, queryKeys.tasks.list(), task, {
    removed: task.deleted,
    matches: taskMatches,
  });
};
