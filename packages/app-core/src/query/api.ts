import type { ApiClient, components } from '@gagnechris/api-client';

export type Post = components['schemas']['Post'];
export type Home = components['schemas']['Home'];
export type Resume = components['schemas']['Resume'];
export type CreatePostRequest = components['schemas']['CreatePostRequest'];
export type UpdatePostRequest = components['schemas']['UpdatePostRequest'];
export type UpdateHomeRequest = components['schemas']['UpdateHomeRequest'];
export type UpdateResumeRequest = components['schemas']['UpdateResumeRequest'];
export type ExpectedVersionRequest =
  components['schemas']['ExpectedVersionRequest'];

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
  response: { status: number };
};

const unwrap = <T>(result: OpenApiResult<T>, label: string): T => {
  if (result.error || !result.data) {
    throw new ApiError(
      `${label} (${result.response.status}).`,
      result.response.status,
    );
  }
  return result.data;
};

/** Non-throwing shape for useDraftPublishEditor. */
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

export const fetchPosts = async (client: ApiClient): Promise<Post[]> => {
  const result = await client.GET('/api/admin/posts');
  const data = unwrap(result, 'Could not load posts');
  return data.items.filter((p) => p.status !== 'deleted');
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
): Promise<Post> => {
  const result = await client.DELETE('/api/admin/posts/{id}', {
    params: { path: { id } },
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
