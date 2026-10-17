// Every export needs an importer outside this package (scripts/test/exports-used.test.ts).

export { AppApiProvider, useGetApiClient } from './AppApiProvider.js';
export { type ConfirmFn, type RetrySignals } from './platform.js';
export {
  emptyPostDraft,
  parsePostTags,
  postDraftFromPost,
  postPayload,
  type PostDraftFields,
} from './postDraft.js';
export {
  emptyHomeDraft,
  homeDraftFromHome,
  homePayload,
  type HomeDraftFields,
} from './homeDraft.js';
export {
  isPlaceholderSlug,
  newPlaceholderSlug,
  slugWasPublished,
} from './placeholderSlug.js';
export {
  emptyProjectDraft,
  emptyProjectLink,
  hasProjectDraftErrors,
  hasProjectPublishErrors,
  NEW_PROJECT_NAME,
  projectDraftFromProject,
  projectHrefError,
  projectLinkErrors,
  projectOrderError,
  projectPayload,
  projectPreviewImageError,
  type ProjectDraftFields,
  type ProjectLinkDraft,
} from './projectDraft.js';
export {
  createResumeContentBuilder,
  emptyEducation,
  emptyExperience,
  emptyResumeDraft,
  experienceRangeError,
  hasExperienceRangeError,
  RESUME_PDF_PATH,
  resumeDraftFromResume,
  resumePayload,
  resumeRoleEndId,
  roleTitle,
  type EducationDraft,
  type ExperienceDraft,
  type ResumeContentBuilder,
  type ResumeDraftFields,
} from './resumeDraft.js';
export {
  accessChange,
  formatAdded,
  hasApp,
  LEVEL_APPS,
  LEVEL_DESCRIPTIONS,
  LEVEL_ORDER,
  STATUS_LABELS,
  userErrorMessage,
} from './userAccess.js';
export {
  changeToast,
  isReauthRequired,
  isRecentSignIn,
  type UserChange,
} from './userChange.js';
export { useLatest } from './useLatest.js';
export {
  clearPendingFlushes,
  hasPendingFlushes,
  pendingFlushCount,
  subscribePendingFlushes,
} from './pendingFlushes.js';
export {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_RETRY_DELAYS_MS,
  useQueuedAutosave,
  type SaveState,
} from './useQueuedAutosave.js';
export {
  useVersionedDocEditor,
  type VersionedDocEditorOptions,
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
  errorMessage,
  fetchDailyTemplate,
  fetchNoteTemplates,
  fetchNotebookAreas,
  fetchNotesPage,
  fetchTasksPage,
  unwrap,
  type DailyTemplate,
  type NoteTemplate,
  type Home,
  type Note,
  type NotebookArea,
  type NotebookAreaEntry,
  type Post,
  type PostSummary,
  type Project,
  type Resume,
  type Task,
} from './query/api.js';
export { setCachedNote, setCachedTask } from './query/cache.js';
export { createVersionedResource } from './query/createVersionedResource.js';
export {
  postResource,
  useCreatePostMutation,
  useDeletePostMutation,
  usePostsQuery,
} from './query/posts.js';
export {
  projectResource,
  useCreateProjectMutation,
  useCreateStarterProjectsMutation,
  useDeleteProjectMutation,
  useProjectsQuery,
} from './query/projects.js';
export {
  useInviteUserMutation,
  useSetUserAccessMutation,
  useUserActionMutation,
  useUsersQuery,
} from './query/users.js';
export { homeResource } from './query/home.js';
export { resumeResource } from './query/resume.js';
export {
  dailyNoteResource,
  isTemplateStartedDaily,
  noteResource,
  startDailyNoteBlank,
  useCreateNoteMutation,
  useDailyNoteDatesQuery,
  useDeleteNoteMutation,
  useNotesByIds,
  useNotesQuery,
  usePinNoteMutation,
} from './query/notes.js';
export {
  useNotebookAreas,
  useNotebookAreasQuery,
  useSaveNotebookAreasMutation,
} from './query/areas.js';
export {
  dailyTemplateResource,
  useResetDailyTemplateMutation,
} from './query/templates.js';
export {
  noteTemplateResource,
  useCreateNoteTemplateMutation,
  useDeleteNoteTemplateMutation,
  useNoteTemplatesQuery,
} from './query/noteTemplates.js';
export {
  taskResource,
  useDeleteTaskMutation,
  usePatchTaskMutation,
  useTaskParents,
  useTasksByIds,
  useTasksQuery,
  type TaskPatch,
} from './query/tasks.js';
export {
  SEARCH_TRUNCATED_HINT,
  useDebouncedNotebookSearch,
  useNotebookSearchQuery,
  type LiveTaskHit,
} from './query/search.js';
export { taskActionError } from './query/taskActionError.js';
export { useTaskToggle } from './query/useTaskToggle.js';
export { useTaskDescriptionEditor } from './query/useTaskDescriptionEditor.js';
export { useMoveTaskToDay } from './query/useMoveTaskToDay.js';
export { useQuickAddTask } from './query/useQuickAddTask.js';
export {
  emptyTaskDraft,
  taskDraftFromTask,
  taskPayloadFromDraft,
  type TaskDraft,
} from './query/taskDraft.js';
export {
  useLoadAllPages,
  useReportEmbeddedIds,
  useTaskPatch,
  useTodayTasks,
  type TodayStillOpenRow,
} from './query/today.js';
export {
  EMBED_DELETE_GRACE_MS,
  EMBED_RETRY_DELAYS_MS,
  useNoteTaskEmbedSync,
  type EmbedNote,
  type TaskEmbedCreate,
  type TaskEmbedState,
} from './query/useNoteTaskEmbedSync.js';
