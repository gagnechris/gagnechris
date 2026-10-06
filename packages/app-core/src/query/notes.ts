import { createUlid } from '@gagnechris/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  ApiError,
  createNote,
  deleteNote,
  fetchDailyNote,
  fetchNote,
  fetchNotesPage,
  isEmptyDailyNote,
  openDailyNote,
  updateNote,
  upsertDailyNote,
  type CreateNoteRequest,
  type ListNotesQuery,
  type Note,
  type NotebookArea,
  type UpdateNoteRequest,
} from './api.js';
import { setCachedNote } from './cache.js';
import {
  createVersionedResource,
  useDeleteEntityMutation,
} from './createVersionedResource.js';
import { queryKeys } from './keys.js';

export type NoteResourceParams = { id: string };

export type DailyNoteResourceParams = {
  area: NotebookArea;
  date: string;
  /** Opening today's note creates it with earlier open tasks carried in. */
  carryIn?: boolean;
};

/** Kept until the first successful upsert so re-renders reuse one client id. */
const pendingDailyIds = new Map<string, string>();

const pendingDailyKey = (area: NotebookArea, date: string) => `${area}:${date}`;

const pendingDailyId = (area: NotebookArea, date: string): string => {
  const key = pendingDailyKey(area, date);
  let id = pendingDailyIds.get(key);
  if (!id) {
    id = createUlid();
    pendingDailyIds.set(key, id);
  }
  return id;
};

export const emptyDailyPlaceholder = (
  area: NotebookArea,
  date: string,
  userId: string,
): Note => {
  const id = pendingDailyId(area, date);
  const now = new Date().toISOString();
  return {
    id,
    userId,
    area,
    type: 'daily',
    date,
    title: '',
    bodyMarkdown: '',
    tags: [],
    pinned: false,
    taskIds: [],
    version: 0,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
};

export const fetchDailyNoteEntity = async (
  client: Parameters<typeof fetchDailyNote>[0],
  area: NotebookArea,
  date: string,
  carryIn = false,
): Promise<Note> => {
  const data = carryIn
    ? await openDailyNote(client, area, date, pendingDailyId(area, date))
    : await fetchDailyNote(client, area, date);
  if (isEmptyDailyNote(data)) {
    return emptyDailyPlaceholder(area, date, data.userId);
  }
  pendingDailyIds.delete(pendingDailyKey(area, date));
  return data;
};

export const noteResource = createVersionedResource<Note, NoteResourceParams>({
  queryKey: ({ id }) => queryKeys.notes.detail(id),
  fetch: (client, { id }) => fetchNote(client, id),
  update: (client, { id }, body) =>
    updateNote(client, id, body as UpdateNoteRequest),
  delete: (client, { id }, body) => deleteNote(client, id, body),
  setCache: setCachedNote,
});

export const dailyNoteResource = createVersionedResource<
  Note,
  DailyNoteResourceParams
>({
  queryKey: ({ area, date }) => queryKeys.notes.daily(area, date),
  fetch: (client, { area, date, carryIn }) =>
    fetchDailyNoteEntity(client, area, date, carryIn),
  update: async (client, { area, date }, body) => {
    const version = typeof body.version === 'number' ? body.version : undefined;
    const id = String(body.id ?? '');
    const saved = await upsertDailyNote(client, area, date, {
      id,
      version: version === 0 ? undefined : version,
      title: typeof body.title === 'string' ? body.title : undefined,
      bodyMarkdown:
        typeof body.bodyMarkdown === 'string' ? body.bodyMarkdown : undefined,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
      pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
    });
    pendingDailyIds.delete(pendingDailyKey(area, date));
    return saved;
  },
  setCache: setCachedNote,
});

/** One detail query per id; a 404 (deleted note) is not retried. */
export const useNotesByIds = (ids: readonly string[]) => {
  const getClient = useGetApiClient();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.notes.detail(id),
      queryFn: () => fetchNote(getClient(), id),
      retry: (failures: number, error: Error) =>
        !(error instanceof ApiError && error.status === 404) && failures < 2,
    })),
  });
};

export const useNotesQuery = (filters: ListNotesQuery = {}) => {
  const getClient = useGetApiClient();
  const { cursor: _cursor, ...keyFilters } = filters;
  return useInfiniteQuery({
    queryKey: queryKeys.notes.list(keyFilters),
    queryFn: ({ pageParam }) =>
      fetchNotesPage(getClient(), {
        ...filters,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
};

export const useDailyNoteDatesQuery = (
  area: NotebookArea | undefined,
  from: string,
  to: string,
  enabled = true,
) => {
  const getClient = useGetApiClient();
  return useQuery({
    queryKey: queryKeys.notes.dailyDates(area, from, to),
    queryFn: async () => {
      const dates = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await fetchNotesPage(getClient(), {
          area,
          type: 'daily',
          from,
          to,
          cursor,
          limit: 100,
        });
        for (const note of page.items) {
          if (note.date) dates.add(note.date);
        }
        cursor = page.nextCursor;
      } while (cursor);
      return dates;
    },
    enabled,
    staleTime: 30_000,
  });
};

export const useCreateNoteMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNoteRequest) => createNote(getClient(), body),
    onSuccess: (note) => {
      setCachedNote(queryClient, note);
    },
  });
};

export const useDeleteNoteMutation = () =>
  useDeleteEntityMutation(deleteNote, setCachedNote);
