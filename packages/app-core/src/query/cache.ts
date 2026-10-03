import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  Home,
  Note,
  NotesPage,
  Post,
  PostsPage,
  Resume,
  Task,
  TasksPage,
} from './api.js';
import { queryKeys } from './keys.js';

type PostsListData = InfiniteData<PostsPage, string | undefined>;
type NotesListData = InfiniteData<NotesPage, string | undefined>;
type TasksListData = InfiniteData<TasksPage, string | undefined>;

/** A stale GET can race a mutation, so keep the higher version. */
export const preferNewerByVersion = <T extends { version: number }>(
  prev: T | undefined,
  next: T,
): T => {
  if (prev !== undefined && prev.version > next.version) return prev;
  return next;
};

type Paged<T> = InfiniteData<{ items: T[] }, string | undefined>;

/**
 * `undefined` when the filters cannot be evaluated client-side: update rows
 * already there, never insert.
 */
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

export const setCachedPost = (queryClient: QueryClient, post: Post): void => {
  queryClient.setQueryData<Post>(queryKeys.posts.detail(post.id), (prev) =>
    preferNewerByVersion(prev, post),
  );
  // Seeded even before first fetch so the create flow shows the new post.
  queryClient.setQueryData<PostsListData>(queryKeys.posts.list(), (prev) =>
    upsertInPages(prev, post, {
      removed: post.status === 'deleted',
      matches: true,
    }),
  );
  for (const [key, data] of queryClient.getQueriesData<PostsListData>({
    queryKey: [...queryKeys.posts.all, 'list'],
  })) {
    if (key.length === queryKeys.posts.list().length || !isInfinite(data)) {
      continue;
    }
    queryClient.setQueryData<PostsListData>(
      key,
      upsertInPages(data, post, {
        removed: post.status === 'deleted',
        matches: postMatches(post, listFilters(key)),
      }),
    );
  }
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
  // Mirrors the API: date ranges only list daily notes (`DATE#` keys).
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
    queryClient.setQueryData<Note>(
      queryKeys.notes.daily(note.area, note.date),
      (prev) => preferNewerByVersion(prev, note),
    );
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
  for (const [key, data] of queryClient.getQueriesData<NotesListData>({
    queryKey: [...queryKeys.notes.all, 'list'],
  })) {
    if (!isInfinite(data)) continue;
    queryClient.setQueryData<NotesListData>(
      key,
      upsertInPages(data, note, {
        removed: note.deleted,
        matches: noteMatches(note, listFilters(key)),
      }),
    );
  }
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
  for (const [key, data] of queryClient.getQueriesData<TasksListData>({
    queryKey: [...queryKeys.tasks.all, 'list'],
  })) {
    if (!isInfinite(data)) continue;
    queryClient.setQueryData<TasksListData>(
      key,
      upsertInPages(data, task, {
        removed: task.deleted,
        matches: taskMatches(task, listFilters(key)),
      }),
    );
  }
};
