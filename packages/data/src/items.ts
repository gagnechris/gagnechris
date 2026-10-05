import { z } from 'zod';
import {
  CalendarDateSchema,
  NotebookAreaSchema,
  NoteTypeSchema,
  PostSeoSchema,
  PostStatusSchema,
  ProjectDemoSchema,
  ProjectLinkSchema,
  ProjectStageSchema,
  ResumeContentSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
  type Home,
  type Note,
  type Post,
  type Project,
  type Resume,
  type Task,
} from '@gagnechris/shared';
import {
  EMPTY_SLUG_FALLBACK,
  slugify as sharedSlugify,
  taskEmbedIds,
} from '@gagnechris/shared';
import { deepEqual } from './deep-equal.js';
import {
  HOME_ID,
  homeMetaSk,
  homePk,
  homePublishedSk,
  dailyNoteClaimPk,
  dailyNoteClaimSk,
  noteDateGsi1Sk,
  noteMetaSk,
  notePageGsi1Sk,
  notePk,
  noteTasksGsi2Pk,
  noteTasksGsi2Sk,
  notebookAreaGsi1Pk,
  postMetaSk,
  postPk,
  postPublishedSk,
  projectOrderGsi1Sk,
  projectPk,
  projectStatusGsi1Pk,
  RESUME_ID,
  SK_META,
  SK_PUBLISHED,
  resumeMetaSk,
  resumePk,
  resumePublishedSk,
  statusGsi1Pk,
  statusGsi1Sk,
  taskAreaStatusGsi1Pk,
  taskMetaSk,
  taskPk,
  taskSomedayGsi1Sk,
  taskStartGsi1Sk,
  taskUpdatedGsi1Sk,
} from './keys.js';

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  return sharedSlugify(input) || EMPTY_SLUG_FALLBACK;
}

export const PublishableMetaFieldsSchema = z.object({
  status: PostStatusSchema,
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string().min(1),
  /** Items missing the attribute are still treated as 0 by VERSION_MATCH_CONDITION. */
  version: z.number().int().nonnegative(),
});

export const PostMetaItemSchema = PublishableMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('post'),
  postId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  excerpt: z.string(),
  bodyMarkdown: z.string(),
  tags: z.array(z.string()),
  projectIds: z.array(z.string()).optional(),
  coverImage: z.string().nullable().optional(),
  seo: PostSeoSchema.nullable().optional(),
  gsi1pk: z.string().min(1).optional(),
  gsi1sk: z.string().min(1).optional(),
});

export type PostMetaItem = z.infer<typeof PostMetaItemSchema>;

export const ProjectMetaItemSchema = PublishableMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('project'),
  projectId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  pitch: z.string(),
  stage: ProjectStageSchema,
  stageNote: z.string(),
  previewImage: z.string().nullable(),
  bodyMarkdown: z.string(),
  stack: z.array(z.string()),
  links: z.array(ProjectLinkSchema),
  demo: ProjectDemoSchema.nullable(),
  order: z.number().int().nonnegative(),
  href: z.string().nullable(),
  gsi1pk: z.string().min(1).optional(),
  gsi1sk: z.string().min(1).optional(),
});

export type ProjectMetaItem = z.infer<typeof ProjectMetaItemSchema>;

export const HomeMetaItemSchema = PublishableMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('home'),
  homeId: z.string().min(1).default(HOME_ID),
  name: z.string().min(1),
  title: z.string(),
  about: z.string(),
  seo: PostSeoSchema.nullable().optional(),
});

export type HomeMetaItem = z.infer<typeof HomeMetaItemSchema>;

export const ResumeMetaItemSchema = PublishableMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('resume'),
  resumeId: z.string().min(1).default(RESUME_ID),
  name: z.string().min(1),
  pdfPath: z.string().min(1),
  content: ResumeContentSchema,
  seo: PostSeoSchema.nullable().optional(),
});

export type ResumeMetaItem = z.infer<typeof ResumeMetaItemSchema>;

export const ContactEmailStatusSchema = z.enum(['pending', 'sent', 'failed']);
export type ContactEmailStatus = z.infer<typeof ContactEmailStatusSchema>;

export const ContactMsgItemSchema = z.object({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('contact'),
  contactId: z.string().min(1),
  name: z.string(),
  email: z.string(),
  message: z.string(),
  sourceIp: z.string(),
  createdAt: z.string().min(1),
  emailStatus: ContactEmailStatusSchema,
  emailError: z.string().optional(),
});

export type ContactMsgItem = z.infer<typeof ContactMsgItemSchema>;

export function parsePostMetaItem(raw: unknown): PostMetaItem {
  return PostMetaItemSchema.parse(raw);
}

export function parseHomeMetaItem(raw: unknown): HomeMetaItem {
  return HomeMetaItemSchema.parse(raw);
}

export function parseResumeMetaItem(raw: unknown): ResumeMetaItem {
  return ResumeMetaItemSchema.parse(raw);
}

export function parseContactMsgItem(raw: unknown): ContactMsgItem {
  return ContactMsgItemSchema.parse(raw);
}

export function postContentEqual(
  a: Pick<
    Post,
    | 'slug'
    | 'title'
    | 'excerpt'
    | 'bodyMarkdown'
    | 'tags'
    | 'projectIds'
    | 'coverImage'
    | 'seo'
  >,
  b: Pick<
    Post,
    | 'slug'
    | 'title'
    | 'excerpt'
    | 'bodyMarkdown'
    | 'tags'
    | 'projectIds'
    | 'coverImage'
    | 'seo'
  >,
): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.bodyMarkdown === b.bodyMarkdown &&
    deepEqual(a.tags, b.tags) &&
    deepEqual(a.projectIds, b.projectIds) &&
    a.coverImage === b.coverImage &&
    deepEqual(a.seo ?? null, b.seo ?? null)
  );
}

export function metaToPost(
  item: PostMetaItem,
  hasUnpublishedChanges = false,
): Post {
  return {
    id: item.postId,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    bodyMarkdown: item.bodyMarkdown,
    tags: item.tags,
    projectIds: item.projectIds ?? [],
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    coverImage: item.coverImage ?? null,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildMetaItem(post: Post): PostMetaItem {
  const sortTs =
    post.status === 'published' && post.publishedAt
      ? post.publishedAt
      : post.updatedAt;
  return {
    pk: postPk(post.id),
    sk: postMetaSk(),
    entityType: 'post',
    postId: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    tags: post.tags,
    projectIds: post.projectIds,
    status: post.status,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    coverImage: post.coverImage,
    seo: post.seo,
    version: post.version,
    gsi1pk: statusGsi1Pk(post.status),
    gsi1sk: statusGsi1Sk(sortTs, post.id),
  };
}

/** Omits GSI1 keys so admin `STATUS#published` queries only return draft META rows. */
export function buildPublishedItem(
  post: Post,
): Omit<PostMetaItem, 'gsi1pk' | 'gsi1sk'> {
  const publishedAt = post.publishedAt ?? post.updatedAt;
  const meta = buildMetaItem({ ...post, status: 'published', publishedAt });
  const { gsi1pk: _gsi1pk, gsi1sk: _gsi1sk, ...rest } = meta;
  return {
    ...rest,
    sk: postPublishedSk(),
    status: 'published',
    publishedAt,
  };
}

export function parseProjectMetaItem(raw: unknown): ProjectMetaItem {
  return ProjectMetaItemSchema.parse(raw);
}

export function projectContentEqual(a: Project, b: Project): boolean {
  return (
    a.slug === b.slug &&
    a.name === b.name &&
    a.pitch === b.pitch &&
    a.stage === b.stage &&
    a.stageNote === b.stageNote &&
    a.previewImage === b.previewImage &&
    a.bodyMarkdown === b.bodyMarkdown &&
    deepEqual(a.stack, b.stack) &&
    deepEqual(a.links, b.links) &&
    a.demo === b.demo &&
    a.order === b.order &&
    a.href === b.href
  );
}

export function metaToProject(
  item: ProjectMetaItem,
  hasUnpublishedChanges = false,
): Project {
  return {
    id: item.projectId,
    slug: item.slug,
    name: item.name,
    pitch: item.pitch,
    stage: item.stage,
    stageNote: item.stageNote,
    previewImage: item.previewImage,
    bodyMarkdown: item.bodyMarkdown,
    stack: item.stack,
    links: item.links,
    demo: item.demo,
    order: item.order,
    href: item.href,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildProjectMetaItem(project: Project): ProjectMetaItem {
  return {
    pk: projectPk(project.id),
    sk: SK_META,
    entityType: 'project',
    projectId: project.id,
    slug: project.slug,
    name: project.name,
    pitch: project.pitch,
    stage: project.stage,
    stageNote: project.stageNote,
    previewImage: project.previewImage,
    bodyMarkdown: project.bodyMarkdown,
    stack: project.stack,
    links: project.links,
    demo: project.demo,
    order: project.order,
    href: project.href,
    status: project.status,
    publishedAt: project.publishedAt,
    updatedAt: project.updatedAt,
    version: project.version,
    gsi1pk: projectStatusGsi1Pk(project.status),
    gsi1sk: projectOrderGsi1Sk(project.order, project.id),
  };
}

/** Omits GSI1 keys so the published-projects query only returns META rows. */
export function buildProjectPublishedItem(
  project: Project,
): Omit<ProjectMetaItem, 'gsi1pk' | 'gsi1sk'> {
  const publishedAt = project.publishedAt ?? project.updatedAt;
  const {
    gsi1pk: _gsi1pk,
    gsi1sk: _gsi1sk,
    ...rest
  } = buildProjectMetaItem({ ...project, status: 'published', publishedAt });
  return { ...rest, sk: SK_PUBLISHED, status: 'published', publishedAt };
}

export function homeContentEqual(
  a: Pick<Home, 'name' | 'title' | 'about' | 'seo'>,
  b: Pick<Home, 'name' | 'title' | 'about' | 'seo'>,
): boolean {
  return (
    a.name === b.name &&
    a.title === b.title &&
    a.about === b.about &&
    deepEqual(a.seo ?? null, b.seo ?? null)
  );
}

export function metaToHome(
  item: HomeMetaItem,
  hasUnpublishedChanges = false,
): Home {
  return {
    name: item.name,
    title: item.title,
    about: item.about,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildHomeMetaItem(home: Home): HomeMetaItem {
  return {
    pk: homePk(),
    sk: homeMetaSk(),
    entityType: 'home',
    homeId: HOME_ID,
    name: home.name,
    title: home.title,
    about: home.about,
    status: home.status,
    publishedAt: home.publishedAt,
    updatedAt: home.updatedAt,
    seo: home.seo,
    version: home.version,
  };
}

export function buildHomePublishedItem(home: Home): HomeMetaItem {
  return {
    ...buildHomeMetaItem(home),
    sk: homePublishedSk(),
    status: 'published',
  };
}

export function resumeContentEqual(
  a: Pick<Resume, 'name' | 'pdfPath' | 'content' | 'seo'>,
  b: Pick<Resume, 'name' | 'pdfPath' | 'content' | 'seo'>,
): boolean {
  return (
    a.name === b.name &&
    a.pdfPath === b.pdfPath &&
    deepEqual(a.content, b.content) &&
    deepEqual(a.seo ?? null, b.seo ?? null)
  );
}

export function metaToResume(
  item: ResumeMetaItem,
  hasUnpublishedChanges = false,
): Resume {
  return {
    name: item.name,
    pdfPath: item.pdfPath,
    content: item.content,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildResumeMetaItem(resume: Resume): ResumeMetaItem {
  return {
    pk: resumePk(),
    sk: resumeMetaSk(),
    entityType: 'resume',
    resumeId: RESUME_ID,
    name: resume.name,
    pdfPath: resume.pdfPath,
    content: resume.content,
    status: resume.status,
    publishedAt: resume.publishedAt,
    updatedAt: resume.updatedAt,
    seo: resume.seo,
    version: resume.version,
  };
}

export function buildResumePublishedItem(resume: Resume): ResumeMetaItem {
  return {
    ...buildResumeMetaItem(resume),
    sk: resumePublishedSk(),
    status: 'published',
  };
}

export const VersionedMetaFieldsSchema = z.object({
  version: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deleted: z.boolean(),
  createHash: z.string().min(1).optional(),
  syncPk: z.string().min(1).optional(),
  syncSk: z.string().min(1).optional(),
  ttl: z.number().int().positive().optional(),
  gsi1pk: z.string().min(1).optional(),
  gsi1sk: z.string().min(1).optional(),
  gsi2pk: z.string().min(1).optional(),
  gsi2sk: z.string().min(1).optional(),
});

export const NoteMetaItemSchema = VersionedMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('note'),
  id: z.string().min(1),
  userId: z.string().min(1),
  area: NotebookAreaSchema,
  type: NoteTypeSchema,
  date: CalendarDateSchema.nullable(),
  title: z.string(),
  bodyMarkdown: z.string(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
  /** Absent on rows written before embeds; derived from the body on read. */
  taskIds: z.array(z.string()).optional(),
});

export type NoteMetaItem = z.infer<typeof NoteMetaItemSchema>;

export const DailyNoteClaimItemSchema = z.object({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('dailyNoteClaim'),
  userId: z.string().min(1),
  area: NotebookAreaSchema,
  date: CalendarDateSchema,
  noteId: z.string().min(1),
});

export type DailyNoteClaimItem = z.infer<typeof DailyNoteClaimItemSchema>;

export const TaskMetaItemSchema = VersionedMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('task'),
  id: z.string().min(1),
  userId: z.string().min(1),
  area: NotebookAreaSchema,
  title: z.string().min(1),
  description: z.string(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  dueDate: CalendarDateSchema.nullable(),
  /** Absent on rows the start-date migration has not reached; see {@link metaToTask}. */
  startDate: CalendarDateSchema.nullable().optional(),
  someday: z.boolean().optional(),
  completedAt: z.string().nullable(),
  noteId: z.string().min(1).nullable(),
  tags: z.array(z.string()),
});

export type TaskMetaItem = z.infer<typeof TaskMetaItemSchema>;

export function parseNoteMetaItem(raw: unknown): NoteMetaItem {
  return NoteMetaItemSchema.parse(raw);
}

export function parseDailyNoteClaimItem(raw: unknown): DailyNoteClaimItem {
  return DailyNoteClaimItemSchema.parse(raw);
}

export function parseTaskMetaItem(raw: unknown): TaskMetaItem {
  return TaskMetaItemSchema.parse(raw);
}

export function noteContentEqual(
  a: Pick<
    Note,
    'area' | 'type' | 'date' | 'title' | 'bodyMarkdown' | 'tags' | 'pinned'
  >,
  b: Pick<
    Note,
    'area' | 'type' | 'date' | 'title' | 'bodyMarkdown' | 'tags' | 'pinned'
  >,
): boolean {
  return (
    a.area === b.area &&
    a.type === b.type &&
    a.date === b.date &&
    a.title === b.title &&
    a.bodyMarkdown === b.bodyMarkdown &&
    a.pinned === b.pinned &&
    deepEqual(a.tags, b.tags)
  );
}

export function taskContentEqual(
  a: Pick<
    Task,
    | 'area'
    | 'title'
    | 'description'
    | 'priority'
    | 'status'
    | 'dueDate'
    | 'startDate'
    | 'someday'
    | 'completedAt'
    | 'noteId'
    | 'tags'
  >,
  b: Pick<
    Task,
    | 'area'
    | 'title'
    | 'description'
    | 'priority'
    | 'status'
    | 'dueDate'
    | 'startDate'
    | 'someday'
    | 'completedAt'
    | 'noteId'
    | 'tags'
  >,
): boolean {
  return (
    a.area === b.area &&
    a.title === b.title &&
    a.description === b.description &&
    a.priority === b.priority &&
    a.status === b.status &&
    a.dueDate === b.dueDate &&
    a.startDate === b.startDate &&
    a.someday === b.someday &&
    a.completedAt === b.completedAt &&
    a.noteId === b.noteId &&
    deepEqual(a.tags, b.tags)
  );
}

export function metaToNote(item: NoteMetaItem): Note {
  return {
    id: item.id,
    userId: item.userId,
    area: item.area,
    type: item.type,
    date: item.date,
    title: item.title,
    bodyMarkdown: item.bodyMarkdown,
    tags: item.tags,
    pinned: item.pinned,
    taskIds: item.taskIds ?? taskEmbedIds(item.bodyMarkdown),
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deleted: item.deleted,
  };
}

/**
 * A row with no `startDate` attribute shows on its `dueDate`, so tasks keep
 * their day whether or not the start-date migration has run. An explicit
 * `null` means now.
 */
export function taskStartDateOf(
  item: Pick<TaskMetaItem, 'startDate' | 'dueDate'>,
): string | null {
  return item.startDate !== undefined ? item.startDate : item.dueDate;
}

export function metaToTask(item: TaskMetaItem): Task {
  return {
    id: item.id,
    userId: item.userId,
    area: item.area,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status: item.status,
    dueDate: item.dueDate,
    startDate: taskStartDateOf(item),
    someday: item.someday ?? false,
    completedAt: item.completedAt,
    noteId: item.noteId,
    tags: item.tags,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deleted: item.deleted,
  };
}

/** List GSI keys are omitted when deleted so queries never return tombstones. */
export function buildNoteMetaItem(note: Note): NoteMetaItem {
  const { pk, sk } = { pk: notePk(note.userId, note.id), sk: noteMetaSk() };
  const item: NoteMetaItem = {
    pk,
    sk,
    entityType: 'note',
    id: note.id,
    userId: note.userId,
    area: note.area,
    type: note.type,
    date: note.date,
    title: note.title,
    bodyMarkdown: note.bodyMarkdown,
    tags: note.tags,
    pinned: note.pinned,
    taskIds: note.taskIds,
    version: note.version,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deleted: note.deleted,
  };
  if (!note.deleted) {
    item.gsi1pk = notebookAreaGsi1Pk(note.userId, note.area);
    // PAGE# keeps freeform pages out of the DATE# calendar range queries.
    item.gsi1sk =
      note.type === 'daily' && note.date
        ? noteDateGsi1Sk(note.date, note.id)
        : notePageGsi1Sk(note.updatedAt, note.id);
  }
  return item;
}

export function buildDailyNoteClaimItem(
  userId: string,
  area: Note['area'],
  date: string,
  noteId: string,
): DailyNoteClaimItem {
  return {
    pk: dailyNoteClaimPk(userId, area, date),
    sk: dailyNoteClaimSk(),
    entityType: 'dailyNoteClaim',
    userId,
    area,
    date,
    noteId,
  };
}

export function taskGsi1Sk(
  task: Pick<Task, 'id' | 'startDate' | 'someday' | 'updatedAt'>,
): string {
  if (task.someday) return taskSomedayGsi1Sk(task.updatedAt, task.id);
  if (task.startDate) return taskStartGsi1Sk(task.startDate, task.id);
  return taskUpdatedGsi1Sk(task.updatedAt, task.id);
}

/** Tombstones omit list GSI keys so queries never return them. */
export function buildTaskMetaItem(task: Task): TaskMetaItem {
  const item: TaskMetaItem = {
    pk: taskPk(task.userId, task.id),
    sk: taskMetaSk(),
    entityType: 'task',
    id: task.id,
    userId: task.userId,
    area: task.area,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    startDate: task.startDate,
    someday: task.someday,
    completedAt: task.completedAt,
    noteId: task.noteId,
    tags: task.tags,
    version: task.version,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deleted: task.deleted,
  };
  if (!task.deleted) {
    item.gsi1pk = taskAreaStatusGsi1Pk(task.userId, task.area, task.status);
    item.gsi1sk = taskGsi1Sk(task);
    if (task.noteId) {
      item.gsi2pk = noteTasksGsi2Pk(task.userId, task.noteId);
      item.gsi2sk = noteTasksGsi2Sk(task.id);
    }
  }
  return item;
}
