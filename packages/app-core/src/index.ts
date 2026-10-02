export { AppApiProvider, useGetApiClient } from './AppApiProvider.js';
export { defaultTimers, type ConfirmFn, type Timers } from './platform.js';
export {
  mergeEditorSeo,
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
} from './useDraftPublishEditor.js';
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
  createDraftPublishResource,
  type DraftPublishLifecycleMutators,
  type DraftPublishResource,
  type DraftPublishResourceConfig,
  type VersionedEntity,
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
