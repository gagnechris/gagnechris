import { createUlid } from '@gagnechris/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  createNote,
  deleteNote,
  fetchDailyNote,
  fetchNote,
  fetchNotesBatch,
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
import { useBatchedByIds, type ByIdResult } from './batchedByIds.js';
import {
  createVersionedResource,
  useDeleteEntityMutation,
} from './createVersionedResource.js';
import { queryKeys } from './keys.js';
import { NOTEBOOK_TOO_LARGE_MESSAGE } from './tooLarge.js';

export type NoteResourceParams = { id: string };

export type DailyNoteResourceParams = {
  area: NotebookArea;
  date: string;
  /** Opening today's note creates it with earlier open tasks carried in. */
  carryIn?: boolean;
};

/** Kept until the first successful upsert so re-renders reuse one client id. */
const pendingDailyIds = new Map<string, string>();

/** Days whose template was cleared with Start blank, until the note is saved. */
const blankDailyStarts = new Set<string>();

const pendingDailyKey = (area: NotebookArea, date: string) => `${area}:${date}`;

const forgetPendingDaily = (area: NotebookArea, date: string) => {
  const key = pendingDailyKey(area, date);
  pendingDailyIds.delete(key);
  blankDailyStarts.delete(key);
};

const pendingDailyId = (area: NotebookArea, date: string): string => {
  const key = pendingDailyKey(area, date);
  let id = pendingDailyIds.get(key);
  if (!id) {
    id = createUlid();
    pendingDailyIds.set(key, id);
  }
  return id;
};

/**
 * A day with no note yet shows its area's template as unsaved starting text;
 * this is how the editor tells it apart from a saved note.
 */
export const isTemplateStartedDaily = (note: Note): boolean =>
  note.type === 'daily' && note.version === 0 && note.bodyMarkdown !== '';

export const emptyDailyPlaceholder = (
  area: NotebookArea,
  date: string,
  userId: string,
  templateMarkdown = '',
): Note => {
  const id = pendingDailyId(area, date);
  const blank = blankDailyStarts.has(pendingDailyKey(area, date));
  const now = new Date().toISOString();
  return {
    id,
    userId,
    area,
    type: 'daily',
    date,
    title: '',
    bodyMarkdown: blank ? '' : templateMarkdown,
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
    return emptyDailyPlaceholder(
      area,
      date,
      data.userId,
      data.templateMarkdown,
    );
  }
  forgetPendingDaily(area, date);
  return data;
};

export const noteResource = createVersionedResource<Note, NoteResourceParams>({
  queryKey: ({ id }) => queryKeys.notes.detail(id),
  fetch: (client, { id }) => fetchNote(client, id),
  update: (client, { id }, body) =>
    updateNote(client, id, body as UpdateNoteRequest),
  delete: (client, { id }, body) => deleteNote(client, id, body),
  setCache: setCachedNote,
  tooLargeMessage: NOTEBOOK_TOO_LARGE_MESSAGE,
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
    forgetPendingDaily(area, date);
    return saved;
  },
  setCache: setCachedNote,
  tooLargeMessage: NOTEBOOK_TOO_LARGE_MESSAGE,
});

/**
 * Start blank: the unsaved day drops its template text and stays blank on
 * refetch until it is saved. Returns the entity for the editor to show.
 */
export const startDailyNoteBlank = (note: Note): Note => {
  if (note.date) blankDailyStarts.add(pendingDailyKey(note.area, note.date));
  return { ...note, bodyMarkdown: '' };
};

/** One `POST /notes/batch` for every id; see {@link useBatchedByIds}. */
export const useNotesByIds = (ids: readonly string[]): ByIdResult<Note>[] => {
  const getClient = useGetApiClient();
  return useBatchedByIds(ids, {
    batchKey: queryKeys.notes.batch,
    detailKey: queryKeys.notes.detail,
    fetchBatch: (chunk) => fetchNotesBatch(getClient(), chunk),
    fetchOne: (id) => fetchNote(getClient(), id),
    notFound: 'Note not found.',
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

/** Pins or unpins a note from a list row, outside its editor. */
export const usePinNoteMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ note, pinned }: { note: Note; pinned: boolean }) =>
      updateNote(getClient(), note.id, { version: note.version, pinned }),
    onSuccess: (note) => setCachedNote(queryClient, note),
  });
};

/**
 * After `daily_taken`: adds what this device typed to the daily note another
 * device created, and puts that note in the cache, so the editor rehydrates
 * from it.
 */
export const useMergeIntoDailyNoteMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      area,
      date,
      bodyMarkdown,
    }: {
      area: NotebookArea;
      date: string;
      bodyMarkdown: string;
    }) => {
      const client = getClient();
      const current = await fetchDailyNote(client, area, date);
      if (isEmptyDailyNote(current)) {
        throw new Error('That daily note no longer exists.');
      }
      const typed = bodyMarkdown.trim();
      if (!typed || current.bodyMarkdown.includes(typed)) return current;
      const base = current.bodyMarkdown.replace(/\s+$/, '');
      return updateNote(client, current.id, {
        version: current.version,
        bodyMarkdown: base ? `${base}\n\n${typed}\n` : `${typed}\n`,
      });
    },
    onSuccess: (note) => setCachedNote(queryClient, note),
  });
};
