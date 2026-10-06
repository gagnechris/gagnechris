import type { ApiClient, components } from '@gagnechris/api-client';

export type Post = components['schemas']['Post'];
export type PostSummary = components['schemas']['PostSummary'];
export type Project = components['schemas']['Project'];
export type Home = components['schemas']['Home'];
export type Resume = components['schemas']['Resume'];
export type Note = components['schemas']['Note'];
export type Task = components['schemas']['Task'];
export type NotebookSearchResponse =
  components['schemas']['NotebookSearchResponse'];
export type CreatePostRequest = components['schemas']['CreatePostRequest'];
export type UpdatePostRequest = components['schemas']['UpdatePostRequest'];
export type CreateProjectRequest =
  components['schemas']['CreateProjectRequest'];
export type UpdateProjectRequest =
  components['schemas']['UpdateProjectRequest'];
export type UpdateHomeRequest = components['schemas']['UpdateHomeRequest'];
export type UpdateResumeRequest = components['schemas']['UpdateResumeRequest'];
export type CreateNoteRequest = components['schemas']['CreateNoteRequest'];
export type UpdateNoteRequest = components['schemas']['UpdateNoteRequest'];
export type CreateTaskRequest = components['schemas']['CreateTaskRequest'];
export type UpdateTaskRequest = components['schemas']['UpdateTaskRequest'];
export type UpsertDailyNoteRequest =
  components['schemas']['UpsertDailyNoteRequest'];
export type EmptyDailyNote = components['schemas']['EmptyDailyNote'];
export type ExpectedVersionRequest =
  components['schemas']['ExpectedVersionRequest'];
export type NotebookArea = Note['area'];
export type NoteType = Note['type'];

export class ApiError extends Error {
  readonly status: number;
  readonly error?: string;

  constructor(message: string, status: number, error?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
  response: { status: number };
};

function errorCodeFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const code = (body as { error?: unknown }).error;
  return typeof code === 'string' ? code : undefined;
}

export const unwrap = <T>(result: OpenApiResult<T>, label: string): T => {
  if (result.error || !result.data) {
    throw new ApiError(
      `${label} (${result.response.status}).`,
      result.response.status,
      errorCodeFromBody(result.error),
    );
  }
  return result.data;
};

export type MutateResult<T> = {
  data?: T;
  error?: unknown;
  response: { status: number };
};

export const asMutateResult = async <T>(
  run: () => Promise<T>,
): Promise<MutateResult<T>> => {
  try {
    const data = await run();
    return { data, error: undefined, response: { status: 200 } };
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    return { data: undefined, error, response: { status } };
  }
};

export type PostsPage = {
  items: PostSummary[];
  nextCursor?: string;
};

export const fetchPostsPage = async (
  client: ApiClient,
  cursor?: string,
): Promise<PostsPage> => {
  // A full page: the Posts page counts, searches and sorts only what's loaded.
  const result = await client.GET('/api/admin/posts', {
    params: { query: { limit: 100, ...(cursor ? { cursor } : {}) } },
  });
  const data = unwrap(result, 'Could not load posts');
  return {
    items: data.items.filter((p) => p.status !== 'deleted'),
    nextCursor: data.nextCursor,
  };
};

export const fetchPosts = async (client: ApiClient): Promise<PostSummary[]> => {
  const all: PostSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPostsPage(client, cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
};

export const fetchPost = async (
  client: ApiClient,
  id: string,
): Promise<Post> => {
  const result = await client.GET('/api/admin/posts/{id}', {
    params: { path: { id } },
  });
  return unwrap(result, 'Could not load post');
};

export const createPost = async (
  client: ApiClient,
  body?: CreatePostRequest,
): Promise<Post> => {
  const result = await client.POST('/api/admin/posts', {
    body: body ?? {
      title: 'Untitled',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
    },
  });
  return unwrap(result, 'Could not create draft');
};

export const updatePost = async (
  client: ApiClient,
  id: string,
  body: UpdatePostRequest,
): Promise<Post> => {
  const result = await client.PUT('/api/admin/posts/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Could not save post');
};

export const deletePost = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Post> => {
  const result = await client.DELETE('/api/admin/posts/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Delete failed');
};

export const publishPost = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Post> => {
  const result = await client.POST('/api/admin/posts/{id}/publish', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Publish failed');
};

export const unpublishPost = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Post> => {
  const result = await client.POST('/api/admin/posts/{id}/unpublish', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Unpublish failed');
};

export const discardPost = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Post> => {
  const result = await client.POST('/api/admin/posts/{id}/discard', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Discard failed');
};

export const fetchProjects = async (client: ApiClient): Promise<Project[]> => {
  const result = await client.GET('/api/admin/projects', {
    params: { query: {} },
  });
  return unwrap(result, 'Could not load projects').items.filter(
    (p) => p.status !== 'deleted',
  );
};

export const fetchProject = async (
  client: ApiClient,
  id: string,
): Promise<Project> => {
  const result = await client.GET('/api/admin/projects/{id}', {
    params: { path: { id } },
  });
  return unwrap(result, 'Could not load project');
};

export const createProject = async (
  client: ApiClient,
  body: CreateProjectRequest,
): Promise<Project> => {
  const result = await client.POST('/api/admin/projects', { body });
  return unwrap(result, 'Could not create project');
};

export const updateProject = async (
  client: ApiClient,
  id: string,
  body: UpdateProjectRequest,
): Promise<Project> => {
  const result = await client.PUT('/api/admin/projects/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Could not save project');
};

export const deleteProject = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Project> => {
  const result = await client.DELETE('/api/admin/projects/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Delete failed');
};

export const publishProject = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Project> => {
  const result = await client.POST('/api/admin/projects/{id}/publish', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Publish failed');
};

export const unpublishProject = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Project> => {
  const result = await client.POST('/api/admin/projects/{id}/unpublish', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Unpublish failed');
};

export const discardProject = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Project> => {
  const result = await client.POST('/api/admin/projects/{id}/discard', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Discard failed');
};

export const fetchHome = async (client: ApiClient): Promise<Home> => {
  const result = await client.GET('/api/admin/home');
  return unwrap(result, 'Could not load home content');
};

export const updateHome = async (
  client: ApiClient,
  body: UpdateHomeRequest,
): Promise<Home> => {
  const result = await client.PUT('/api/admin/home', { body });
  return unwrap(result, 'Could not save home');
};

export const publishHome = async (
  client: ApiClient,
  body: ExpectedVersionRequest,
): Promise<Home> => {
  const result = await client.POST('/api/admin/home/publish', { body });
  return unwrap(result, 'Publish failed');
};

export const unpublishHome = async (
  client: ApiClient,
  body: ExpectedVersionRequest,
): Promise<Home> => {
  const result = await client.POST('/api/admin/home/unpublish', { body });
  return unwrap(result, 'Unpublish failed');
};

export const discardHome = async (
  client: ApiClient,
  body: ExpectedVersionRequest,
): Promise<Home> => {
  const result = await client.POST('/api/admin/home/discard', { body });
  return unwrap(result, 'Discard failed');
};

export const fetchResume = async (client: ApiClient): Promise<Resume> => {
  const result = await client.GET('/api/admin/resume');
  return unwrap(result, 'Could not load resume');
};

export const updateResume = async (
  client: ApiClient,
  body: UpdateResumeRequest,
): Promise<Resume> => {
  const result = await client.PUT('/api/admin/resume', { body });
  return unwrap(result, 'Could not save resume');
};

export const publishResume = async (
  client: ApiClient,
  body: ExpectedVersionRequest,
): Promise<Resume> => {
  const result = await client.POST('/api/admin/resume/publish', { body });
  return unwrap(result, 'Publish failed');
};

export const unpublishResume = async (
  client: ApiClient,
  body: ExpectedVersionRequest,
): Promise<Resume> => {
  const result = await client.POST('/api/admin/resume/unpublish', { body });
  return unwrap(result, 'Unpublish failed');
};

export const discardResume = async (
  client: ApiClient,
  body: ExpectedVersionRequest,
): Promise<Resume> => {
  const result = await client.POST('/api/admin/resume/discard', { body });
  return unwrap(result, 'Discard failed');
};

export type NotesPage = {
  items: Note[];
  nextCursor?: string;
};

export type ListNotesQuery = components['schemas']['ListNotesQuery'];

export const fetchNotesPage = async (
  client: ApiClient,
  query: ListNotesQuery = {},
): Promise<NotesPage> => {
  const result = await client.GET('/api/notebook/notes', {
    params: { query },
  });
  const data = unwrap(result, 'Could not load notes');
  return {
    items: data.items.filter((n) => !n.deleted),
    nextCursor: data.nextCursor,
  };
};

export const fetchNote = async (
  client: ApiClient,
  id: string,
): Promise<Note> => {
  const result = await client.GET('/api/notebook/notes/{id}', {
    params: { path: { id } },
  });
  return unwrap(result, 'Could not load note');
};

export const createNote = async (
  client: ApiClient,
  body: CreateNoteRequest,
): Promise<Note> => {
  const result = await client.POST('/api/notebook/notes', { body });
  return unwrap(result, 'Could not create note');
};

export const updateNote = async (
  client: ApiClient,
  id: string,
  body: UpdateNoteRequest,
): Promise<Note> => {
  const result = await client.PUT('/api/notebook/notes/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Could not save note');
};

export const deleteNote = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Note> => {
  const result = await client.DELETE('/api/notebook/notes/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Delete failed');
};

export type DailyNoteGetResponse = Note | EmptyDailyNote;

export const isEmptyDailyNote = (
  value: DailyNoteGetResponse,
): value is EmptyDailyNote => 'exists' in value && value.exists === false;

export const fetchDailyNote = async (
  client: ApiClient,
  area: NotebookArea,
  date: string,
): Promise<DailyNoteGetResponse> => {
  const result = await client.GET('/api/notebook/notes/daily/{area}/{date}', {
    params: { path: { area, date } },
  });
  return unwrap(result, 'Could not load daily note');
};

/** Like {@link fetchDailyNote}, but a first open carries earlier open tasks in. */
export const openDailyNote = async (
  client: ApiClient,
  area: NotebookArea,
  date: string,
  id: string,
): Promise<DailyNoteGetResponse> => {
  const result = await client.POST(
    '/api/notebook/notes/daily/{area}/{date}/open',
    { params: { path: { area, date } }, body: { id } },
  );
  return unwrap(result, 'Could not load daily note');
};

export const upsertDailyNote = async (
  client: ApiClient,
  area: NotebookArea,
  date: string,
  body: UpsertDailyNoteRequest,
): Promise<Note> => {
  const result = await client.PUT('/api/notebook/notes/daily/{area}/{date}', {
    params: { path: { area, date } },
    body,
  });
  return unwrap(result, 'Could not save daily note');
};

export type TasksPage = {
  items: Task[];
  nextCursor?: string;
};

/** Flags are booleans here; {@link fetchTasksPage} sends the wire strings. */
export type ListTasksQuery = Omit<
  components['schemas']['ListTasksQuery'],
  'open' | 'someday'
> & {
  open?: boolean;
  someday?: boolean;
};

const wireFlag = (value: boolean | undefined) =>
  value === undefined
    ? undefined
    : value
      ? ('true' as const)
      : ('false' as const);

export const fetchTasksPage = async (
  client: ApiClient,
  query: ListTasksQuery = {},
): Promise<TasksPage> => {
  const { open, someday, ...rest } = query;
  const result = await client.GET('/api/notebook/tasks', {
    params: {
      query: {
        ...rest,
        ...(open !== undefined ? { open: wireFlag(open) } : {}),
        ...(someday !== undefined ? { someday: wireFlag(someday) } : {}),
      },
    },
  });
  const data = unwrap(result, 'Could not load tasks');
  return {
    items: data.items.filter((t) => !t.deleted),
    nextCursor: data.nextCursor,
  };
};

export const fetchTask = async (
  client: ApiClient,
  id: string,
): Promise<Task> => {
  const result = await client.GET('/api/notebook/tasks/{id}', {
    params: { path: { id } },
  });
  return unwrap(result, 'Could not load task');
};

export const createTask = async (
  client: ApiClient,
  body: CreateTaskRequest,
): Promise<Task> => {
  const result = await client.POST('/api/notebook/tasks', { body });
  return unwrap(result, 'Could not create task');
};

export const updateTask = async (
  client: ApiClient,
  id: string,
  body: UpdateTaskRequest,
): Promise<Task> => {
  const result = await client.PUT('/api/notebook/tasks/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Could not save task');
};

export const deleteTask = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Task> => {
  const result = await client.DELETE('/api/notebook/tasks/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Delete failed');
};

export const completeTask = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Task> => {
  const result = await client.POST('/api/notebook/tasks/{id}/complete', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Could not complete task');
};

export const reopenTask = async (
  client: ApiClient,
  id: string,
  body: ExpectedVersionRequest,
): Promise<Task> => {
  const result = await client.POST('/api/notebook/tasks/{id}/reopen', {
    params: { path: { id } },
    body,
  });
  return unwrap(result, 'Could not reopen task');
};

export type NotebookSearchQuery = {
  q: string;
  area?: NotebookArea;
  limit?: number;
};

export const searchNotebook = async (
  client: ApiClient,
  query: NotebookSearchQuery,
): Promise<NotebookSearchResponse> => {
  const result = await client.POST('/api/notebook/search', {
    body: query,
  });
  return unwrap(result, 'Search failed');
};
