import {
  ApiError,
  asMutateResult,
  createPost as createPostCore,
  deletePost as deletePostCore,
  discardHome as discardHomeCore,
  discardPost as discardPostCore,
  discardResume as discardResumeCore,
  fetchHome as fetchHomeCore,
  fetchPost as fetchPostCore,
  fetchPosts as fetchPostsCore,
  fetchResume as fetchResumeCore,
  publishHome as publishHomeCore,
  publishPost as publishPostCore,
  publishResume as publishResumeCore,
  unpublishHome as unpublishHomeCore,
  unpublishPost as unpublishPostCore,
  unpublishResume as unpublishResumeCore,
  updateHome as updateHomeCore,
  updatePost as updatePostCore,
  updateResume as updateResumeCore,
  type CreatePostRequest,
  type ExpectedVersionRequest,
  type Home,
  type MutateResult,
  type Post,
  type Resume,
  type UpdateHomeRequest,
  type UpdatePostRequest,
  type UpdateResumeRequest,
} from '@gagnechris/app-core';
import { createApiClient } from '../../api/client';

export {
  ApiError,
  asMutateResult,
  type CreatePostRequest,
  type ExpectedVersionRequest,
  type Home,
  type MutateResult,
  type Post,
  type Resume,
  type UpdateHomeRequest,
  type UpdatePostRequest,
  type UpdateResumeRequest,
};

/** Web helpers: inject Amplify-backed client (admin pages / autosave). */
export const fetchPosts = (): Promise<Post[]> =>
  fetchPostsCore(createApiClient());
export const fetchPost = (id: string): Promise<Post> =>
  fetchPostCore(createApiClient(), id);
export const createPost = (body?: CreatePostRequest): Promise<Post> =>
  createPostCore(createApiClient(), body);
export const updatePost = (
  id: string,
  body: UpdatePostRequest,
): Promise<Post> => updatePostCore(createApiClient(), id, body);
export const deletePost = (id: string): Promise<Post> =>
  deletePostCore(createApiClient(), id);
export const publishPost = (
  id: string,
  body: ExpectedVersionRequest,
): Promise<Post> => publishPostCore(createApiClient(), id, body);
export const unpublishPost = (
  id: string,
  body: ExpectedVersionRequest,
): Promise<Post> => unpublishPostCore(createApiClient(), id, body);
export const discardPost = (
  id: string,
  body: ExpectedVersionRequest,
): Promise<Post> => discardPostCore(createApiClient(), id, body);

export const fetchHome = (): Promise<Home> => fetchHomeCore(createApiClient());
export const updateHome = (body: UpdateHomeRequest): Promise<Home> =>
  updateHomeCore(createApiClient(), body);
export const publishHome = (body: ExpectedVersionRequest): Promise<Home> =>
  publishHomeCore(createApiClient(), body);
export const unpublishHome = (body: ExpectedVersionRequest): Promise<Home> =>
  unpublishHomeCore(createApiClient(), body);
export const discardHome = (body: ExpectedVersionRequest): Promise<Home> =>
  discardHomeCore(createApiClient(), body);

export const fetchResume = (): Promise<Resume> =>
  fetchResumeCore(createApiClient());
export const updateResume = (body: UpdateResumeRequest): Promise<Resume> =>
  updateResumeCore(createApiClient(), body);
export const publishResume = (body: ExpectedVersionRequest): Promise<Resume> =>
  publishResumeCore(createApiClient(), body);
export const unpublishResume = (
  body: ExpectedVersionRequest,
): Promise<Resume> => unpublishResumeCore(createApiClient(), body);
export const discardResume = (body: ExpectedVersionRequest): Promise<Resume> =>
  discardResumeCore(createApiClient(), body);
