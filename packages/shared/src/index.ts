/** Platform-neutral: no marked, HTML renderers, OpenAPI, or Node DynamoDB helpers. */
// Every export needs an importer outside this package (scripts/test/exports-used.test.ts).
export { APEX_DOMAIN, PROJECT_DEMO_IDS } from './constants.js';
export {
  pageTitle,
  projectPageTitle,
  siteUrl,
  SITE_AUTHOR_NAME,
  SITE_DEFAULT_DESCRIPTION,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  SITE_OG_IMAGE_PATH,
  SITE_PROFILE_IMAGE_SRC,
} from './site-config.js';
export * from './schemas.js';
export { taskMatchesSchedule, taskShowsOn } from './task-schedule.js';
export {
  addDays,
  calendarDay,
  formatCalendarDay,
  isCalendarDay,
  localDateString,
  localDayOf,
  MONTH_LONG,
  parseCalendarDay,
  relativeDayLabel,
  WEEKDAY_LONG,
  weekdayName,
  weekdayOf,
} from './calendar.js';
export {
  formatTaskDay,
  nextWeekday,
  noteDisplayTitle,
  parseTaskSyntax,
  taskDateToken,
  type TaskSchedule,
} from './task-syntax.js';
export { DEFAULT_HOME } from './home-default.js';
export { DEFAULT_RESUME } from './resume-default.js';
export {
  formatResumeShortMonth,
  planResumeDateMigration,
  resumeRoleDates,
  type ResumeDateMigrationRow,
} from './resume-dates.js';
export {
  normalizeResumeText,
  RESUME_DOWNLOAD_FILENAME,
  RESUME_PAGE_TITLE,
  RESUME_UNAVAILABLE_TEXT,
  resumeView,
  type ResumeEducationLine,
  type ResumeRoleView,
  type ResumeSkillRow,
  type ResumeView,
} from './resume-view.js';
export { EMPTY_SLUG_FALLBACK, MAX_SLUG_LENGTH, slugify } from './slugify.js';
export {
  POST_SLUG_KVS_SYNCED_KEY,
  PROJECT_SLUG_KVS_PREFIX,
  PROJECT_SLUG_KVS_SYNCED_KEY,
} from './slug-kvs.js';
export {
  formatPostDate,
  formatPostShortDate,
  postDateAttribute,
} from './post-date.js';
export {
  comparePostsNewestFirst,
  groupPostsByYear,
  HOME_ALL_POSTS_LABEL,
  HOME_RECENT_POSTS_HEADING,
  selectHomeRecentPosts,
  POSTS_INDEX_EMPTY_TEXT,
  POSTS_INDEX_INTRO,
  POSTS_RSS_LINK,
  postsIndexView,
  postsYearId,
  type PostsIndexEntry,
  type PostsIndexItem,
  type PostsIndexYear,
} from './posts-index.js';
export {
  POST_AUTHOR_NOTE,
  POST_META_SEPARATOR,
  readingMinutes,
  readingTimeLabel,
} from './post-reading.js';
export { createUlid } from './ulid.js';
export {
  carriedInMarkdown,
  findTaskEmbeds,
  parseTaskEmbedLine,
  replaceTaskEmbeds,
  taskEmbedFallbackLine,
  taskEmbedIds,
  taskEmbedNesting,
  taskEmbedParents,
  taskEmbedToken,
  type TaskEmbedMarkdownTask,
} from './task-embeds.js';
export { indentWidth } from './indent-width.js';
export {
  insertAfterTaskBlock,
  isMarkdownItem,
  lineAfterOuterBlock,
  markdownItemBlock,
  noteHeadings,
  reindent,
  removeTaskBlock,
  removeTaskEmbedLines,
  removeTaskLine,
  sectionEnd,
  TASK_NEST_WIDTH,
  taskDropNestIndent,
  taskEmbedLineOf,
  taskNestIndent,
  type LineBlock,
  type NoteHeading,
} from './task-blocks.js';
export {
  bulletCheckboxAsTask,
  parseTaskLine,
  TASK_LINE_PREFIX,
  taskLineDraft,
  taskLineDraftKey,
  typedBulletCheckboxAsTask,
  type TaskLineDraft,
} from './task-line.js';
export { parseTagsText } from './tags-text.js';
export {
  highlightParts,
  searchHitDetail,
  wordMatches,
  type TextRange,
} from './search-highlight.js';
export { taskMentions } from './task-mentions.js';
export { deepEqual } from './deep-equal.js';
export { newestById } from './newest-by-id.js';
export {
  bucketTodayTasks,
  COMING_UP_DAYS,
  comingUpDayLabel,
  comingUpShortLabel,
  comingUpWindow,
  carryFooterText,
  snoozeBaseDay,
  sourceNoteName,
  stillOpenSource,
  type ComingUpDay,
  type SourceNote,
  type StillOpenSource,
  type TodayTaskBuckets,
} from './today-task-buckets.js';
export { groupUpcomingTasks, noteChipLabel } from './upcoming-groups.js';
export { taskScheduleLabel } from './task-schedule-label.js';
export {
  matchesTaskShowOn,
  TASK_SHOW_ON_FILTERS,
  TASK_SHOW_ON_LABELS,
  taskShowOnParam,
  taskShowOnQuery,
  type TaskShowOnFilter,
} from './task-show-on.js';
export { taskDue, type TaskDue } from './task-due.js';
export { sortTasksForList } from './task-list-order.js';
export {
  openTaskDateQuery,
  taskDateMenuIds,
  taskDateMenuItems,
  tomorrowOf,
  type TaskDateKind,
  type TaskDateMenuItem,
  type TaskDateQuery,
} from './task-date-menu-items.js';
export {
  activeTaskDateIndex,
  CLOSED_TASK_DATE_MENU,
  taskDateMenuIsOpen,
  taskDateMenuKey,
  taskDateMenuReducer,
  tokenInsertion,
  type TaskDateMenuAction,
  type TaskDateMenuState,
} from './task-date-menu-state.js';
export {
  noteDay,
  noteDayLabel,
  noteFirstLine,
  noteOpenTaskCount,
  noteSections,
  noteTitle,
  sidebarStandingNotes,
} from './note-list-sections.js';
export {
  DEFAULT_NOTEBOOK_AREAS,
  NOTEBOOK_AREA_DUPLICATE_ID_MESSAGE,
  NOTEBOOK_AREA_DUPLICATE_NAME_MESSAGE,
  NOTEBOOK_AREA_NAME_MAX_LENGTH,
  NOTEBOOK_AREA_STORAGE_KEY,
  NOTEBOOK_AREAS_MAX,
  notebookAreaHeading,
  notebookAreaIdFromName,
  notebookAreaName,
  NotebookAreasSchema,
  resolveNotebookArea,
  type NotebookAreaEntry,
  type NotebookAreas,
} from './notebook-area.js';
export {
  DAILY_TEMPLATE_DATE_TOKEN,
  DAILY_TEMPLATE_MAX_BYTES,
  DAILY_TEMPLATE_SECTION_MESSAGE,
  DAILY_TEMPLATE_TASK_MESSAGE,
  DEFAULT_DAILY_TEMPLATES,
  carryIntoDailyTemplate,
  dailyTemplateHasTasks,
  dailyTemplateHeadings,
  dailyTemplateNamedWeekday,
  dailyTemplateWeekdayMessage,
  fillDailyTemplate,
  type DailyTemplate,
} from './daily-templates.js';
export {
  compareNoteTemplates,
  fillNoteTemplate,
  filterNoteTemplates,
  NOTE_TEMPLATE_EMBED_MESSAGE,
  NOTE_TEMPLATE_LIMIT_MESSAGE,
  NOTE_TEMPLATE_MAX_BYTES,
  NOTE_TEMPLATE_MAX_COUNT,
  NOTE_TEMPLATE_NAME_MAX_LENGTH,
  noteTemplateHasEmbeds,
  NoteTemplateSchema,
  type NoteTemplate,
} from './note-templates.js';
export {
  fenceLineKind,
  scanFences,
  type FenceBlock,
} from './markdown-fences.js';
export {
  liveMarkdownLine,
  liveMarkdownLines,
  MARKDOWN_IMAGE,
  type LiveLineStyle,
  type LiveMark,
} from './markdown-live-preview.js';
export { markdownPlainText } from './markdown-text.js';
export {
  findBareUrls,
  isSafeLinkHref,
  isSitePath,
  LINK_HREF_MAX_LENGTH,
  linkLabel,
  POST_LINK_SCHEMES,
  PROJECT_HREF_SCHEMES,
  shortenUrl,
  type BareUrl,
} from './links.js';
export {
  PROJECT_IDEA_PREVIEW_TEXT,
  PROJECT_MINI_UI,
  PROJECT_PREVIEW_HEIGHT,
  PROJECT_PREVIEW_WIDTH,
  PROJECT_STAGE_LABELS,
  PROJECTS_INDEX_EMPTY_TEXT,
  PROJECTS_INDEX_INTRO,
  PROJECTS_INDEX_TITLE,
  PROJECTS_PATH,
  POST_PART_OF_LABEL,
  postPartOfSeparator,
  postLivePath,
  postPartOfSuffix,
  postProjectLinks,
  PROJECT_BUILD_LOG_HEADING,
  PROJECT_BUILD_LOG_ID,
  PROJECT_BUILD_LOG_RSS_LINK,
  PROJECT_DEMO_LABEL,
  PROJECT_DEMO_LABEL_ID,
  projectBuildLogEmptyText,
  projectBuildLogPosts,
  projectCardHref,
  projectLiveHref,
  projectCardViews,
  projectHasPage,
  projectPagePath,
  projectPreview,
  projectPublishFieldErrors,
  projectStageText,
  selectHomeProjects,
  sortProjectsByOrder,
  type PostProjectLink,
  type ProjectBuildLogPost,
  type ProjectCardView,
  type ProjectMiniNode,
  type ProjectPageView,
} from './projects.js';
export * from './users.js';
export { saveLabel, type SaveState } from './save-label.js';
export {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
  type NoteDraft,
} from './note-draft.js';
export { postMatchesQuery } from './post-search.js';
export {
  SITE_HOME_JSON_KEY,
  SITE_HOME_JSON_PATH,
  SITE_POSTS_JSON_PATH,
  SITE_RESUME_JSON_KEY,
  SITE_RESUME_JSON_PATH,
  siteHomeJson,
  sitePostJson,
  sitePostJsonKey,
  sitePostJsonPath,
  siteResumeJson,
  type SiteHomeJson,
  type SitePostJson,
  type SitePostListItem,
  type SitePostsJson,
  type SiteResumeJson,
} from './site-feed.js';
