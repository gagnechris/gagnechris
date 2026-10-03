export { AppApiProvider, useGetApiClient } from './AppApiProvider.js';
export {
  defaultTimers,
  type ConfirmFn,
  type RetrySignals,
  type Timers,
} from './platform.js';
export { mergeEditorSeo } from './mergeEditorSeo.js';
export { clearPendingFlushes, hasPendingFlushes } from './pendingFlushes.js';
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
  completeTask,
  createNote,
  createPost,
  createTask,
  deleteNote,
  deletePost,
  deleteTask,
  discardHome,
  discardPost,
  discardResume,
  fetchDailyNote,
  fetchHome,
  fetchNote,
  fetchNotesPage,
  fetchPost,
  fetchPosts,
  fetchPostsPage,
  fetchResume,
  fetchTask,
  fetchTasksPage,
  isEmptyDailyNote,
  publishHome,
  publishPost,
  publishResume,
  reopenTask,
  searchNotebook,
  unpublishHome,
  unpublishPost,
  unpublishResume,
  unwrap,
  updateHome,
  updateNote,
  updatePost,
  updateResume,
  updateTask,
  upsertDailyNote,
  type CreateNoteRequest,
  type CreatePostRequest,
  type CreateTaskRequest,
  type DailyNoteGetResponse,
  type EmptyDailyNote,
  type ExpectedVersionRequest,
  type Home,
  type ListNotesQuery,
  type ListTasksQuery,
  type MutateResult,
  type Note,
  type NotebookArea,
  type NotebookSearchQuery,
  type NotebookSearchResponse,
  type NoteType,
  type NotesPage,
  type Post,
  type Resume,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TasksPage,
  type UpdateHomeRequest,
  type UpdateNoteRequest,
  type UpdatePostRequest,
  type UpdateResumeRequest,
  type UpdateTaskRequest,
  type UpsertDailyNoteRequest,
} from './query/api.js';
export {
  preferNewerByVersion,
  setCachedHome,
  setCachedNote,
  setCachedPost,
  setCachedResume,
  setCachedTask,
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
export {
  dailyNoteResource,
  emptyDailyPlaceholder,
  fetchDailyNoteEntity,
  noteResource,
  useCreateNoteMutation,
  useDailyNoteDatesQuery,
  useDeleteNoteMutation,
  useNotesQuery,
  useSetNoteCache,
  type DailyNoteResourceParams,
  type NoteResourceParams,
} from './query/notes.js';
export {
  taskResource,
  useCompleteTaskMutation,
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useReopenTaskMutation,
  useSetTaskCache,
  useTasksQuery,
  type TaskResourceParams,
  type TaskVersionVars,
} from './query/tasks.js';
export { useNotebookSearchQuery } from './query/search.js';
