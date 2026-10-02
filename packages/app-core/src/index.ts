export { AppApiProvider, useGetApiClient } from './AppApiProvider.js';
export { defaultTimers, type ConfirmFn, type Timers } from './platform.js';
export { mergeEditorSeo } from './mergeEditorSeo.js';
export {
  useQueuedAutosave,
  type AutosaveResult,
  type FlushResult,
  type SaveState,
} from './useQueuedAutosave.js';
export {
  useDraftPublishEditor,
  type DraftPublishAutosave,
  type DraftPublishDeleteOptions,
  type DraftPublishEditorOptions,
  type DraftPublishHold,
} from './useDraftPublishEditor.js';
export {
  useVersionedDocEditor,
  type VersionedDocDeleteOptions,
  type VersionedDocEditorOptions,
  type VersionedDocEntity,
} from './useVersionedDocEditor.js';
export {
  useVersionedEntityEditor,
  type VersionedEditorEntity,
  type VersionedEntityActionBarProps,
  type VersionedEntityEditorOptions,
} from './useVersionedEntityEditor.js';

export { queryKeys } from './query/keys.js';
export {
  ApiError,
  asMutateResult,
  createPost,
  deletePost,
  discardHome,
  discardPost,
  discardResume,
  fetchHome,
  fetchPost,
  fetchPosts,
  fetchPostsPage,
  fetchResume,
  publishHome,
  publishPost,
  publishResume,
  unpublishHome,
  unpublishPost,
  unpublishResume,
  unwrap,
  updateHome,
  updatePost,
  updateResume,
  type CreatePostRequest,
  type ExpectedVersionRequest,
  type Home,
  type MutateResult,
  type Post,
  type Resume,
  type UpdateHomeRequest,
  type UpdatePostRequest,
  type UpdateResumeRequest,
} from './query/api.js';
export {
  preferNewerByVersion,
  setCachedHome,
  setCachedPost,
  setCachedResume,
} from './query/cache.js';
export {
  createVersionedResource,
  type VersionedEntity,
  type VersionedResource,
  type VersionedResourceConfig,
} from './query/createVersionedResource.js';
export {
  createDraftPublishResource,
  type DraftPublishLifecycleMutators,
  type DraftPublishResource,
  type DraftPublishResourceConfig,
} from './query/createDraftPublishResource.js';
export {
  optimisticMutationHandlers,
  type OptimisticContext,
  type OptimisticTarget,
} from './query/optimistic.js';
export {
  postResource,
  useCreatePostMutation,
  useDeletePostMutation,
  usePostsQuery,
  useSetPostCache,
  type PostResourceParams,
} from './query/posts.js';
export {
  homeResource,
  useSetHomeCache,
  type HomeResourceParams,
} from './query/home.js';
export {
  resumeResource,
  useResumeQuery,
  useSetResumeCache,
  type ResumeResourceParams,
} from './query/resume.js';
