import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Home, Note, NotesPage, Post, PostsPage, Resume } from './api.js';
import { queryKeys } from './keys.js';

type PostsListData = InfiniteData<PostsPage, string | undefined>;
type NotesListData = InfiniteData<NotesPage, string | undefined>;

/** Keep the higher-version entity when a stale GET races a mutation (CHR-147). */
export const preferNewerByVersion = <T extends { version: number }>(
  prev: T | undefined,
  next: T,
): T => {
  if (prev !== undefined && prev.version > next.version) return prev;
  return next;
};

const upsertPostInPages = (
  prev: PostsListData | undefined,
  post: Post,
): PostsListData | undefined => {
  if (!prev) {
    if (post.status === 'deleted') {
      return prev;
    }
    return {
      pages: [{ items: [post] }],
      pageParams: [undefined],
    };
  }

  const exists = prev.pages.some((page) =>
    page.items.some((p) => p.id === post.id),
  );

  if (post.status === 'deleted') {
    return {
      ...prev,
      pages: prev.pages.map((page) => ({
        ...page,
        items: page.items.filter((p) => p.id !== post.id),
      })),
    };
  }

  if (!exists) {
    if (prev.pages.length === 0) {
      return {
        pages: [{ items: [post] }],
        pageParams: prev.pageParams.length ? prev.pageParams : [undefined],
      };
    }
    const [first, ...rest] = prev.pages;
    return {
      ...prev,
      pages: [{ ...first, items: [post, ...first.items] }, ...rest],
    };
  }

  return {
    ...prev,
    pages: prev.pages.map((page) => {
      const index = page.items.findIndex((p) => p.id === post.id);
      if (index === -1) {
        return page;
      }
      const items = [...page.items];
      items[index] = preferNewerByVersion(page.items[index], post);
      return { ...page, items };
    }),
  };
};

/** Write a post into detail + infinite list caches (create/save/publish/etc.). */
export const setCachedPost = (queryClient: QueryClient, post: Post): void => {
  queryClient.setQueryData<Post>(queryKeys.posts.detail(post.id), (prev) =>
    preferNewerByVersion(prev, post),
  );
  queryClient.setQueryData<PostsListData>(queryKeys.posts.list(), (prev) =>
    upsertPostInPages(prev, post),
  );
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

const upsertNoteInPages = (
  prev: NotesListData | undefined,
  note: Note,
): NotesListData | undefined => {
  if (!prev) {
    if (note.deleted) return prev;
    return {
      pages: [{ items: [note] }],
      pageParams: [undefined],
    };
  }

  const exists = prev.pages.some((page) =>
    page.items.some((n) => n.id === note.id),
  );

  if (note.deleted) {
    return {
      ...prev,
      pages: prev.pages.map((page) => ({
        ...page,
        items: page.items.filter((n) => n.id !== note.id),
      })),
    };
  }

  if (!exists) {
    if (prev.pages.length === 0) {
      return {
        pages: [{ items: [note] }],
        pageParams: prev.pageParams.length ? prev.pageParams : [undefined],
      };
    }
    const [first, ...rest] = prev.pages;
    return {
      ...prev,
      pages: [{ ...first, items: [note, ...first.items] }, ...rest],
    };
  }

  return {
    ...prev,
    pages: prev.pages.map((page) => {
      const index = page.items.findIndex((n) => n.id === note.id);
      if (index === -1) return page;
      const items = [...page.items];
      items[index] = preferNewerByVersion(page.items[index], note);
      return { ...page, items };
    }),
  };
};

/** Write a note into detail + daily + list caches. */
export const setCachedNote = (queryClient: QueryClient, note: Note): void => {
  queryClient.setQueryData<Note>(queryKeys.notes.detail(note.id), (prev) =>
    preferNewerByVersion(prev, note),
  );
  if (note.type === 'daily' && note.date) {
    queryClient.setQueryData<Note>(
      queryKeys.notes.daily(note.area, note.date),
      (prev) => preferNewerByVersion(prev, note),
    );
  }
  // Update every notes list query currently in cache.
  for (const query of queryClient.getQueriesData<NotesListData>({
    queryKey: [...queryKeys.notes.all, 'list'],
  })) {
    const [key, data] = query;
    queryClient.setQueryData<NotesListData>(key, upsertNoteInPages(data, note));
  }
};
