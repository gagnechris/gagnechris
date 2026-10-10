/**
 * Writes go/internal/contract/contract.json: what the Go code must agree on
 * with the TypeScript packages (item schemas, key formats, metric names), with
 * sample rows built by the TypeScript builders so Go tests read real shapes.
 *
 *   npx tsx scripts/generate-go-contract.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';
import {
  ContactMsgItemSchema,
  DailyNoteClaimItemSchema,
  DailyTemplateItemSchema,
  HomeMetaItemSchema,
  NoteMetaItemSchema,
  PostMetaItemSchema,
  ProjectMetaItemSchema,
  RemovedUserItemSchema,
  ResumeMetaItemSchema,
  SK_META,
  SK_PUBLISHED,
  TaskMetaItemSchema,
  buildDailyNoteClaimItem,
  buildDailyTemplateItem,
  buildHomeMetaItem,
  buildNoteMetaItem,
  buildProjectMetaItem,
  buildProjectPublishedItem,
  buildPublishedItem,
  buildResumeMetaItem,
  buildResumePublishedItem,
  buildTaskMetaItem,
  contactMsgSk,
  contactPk,
  dailyNoteClaimPk,
  dailyNoteClaimSk,
  dailyTemplatePk,
  dailyTemplateSk,
  homePk,
  metaToHome,
  metaToNote,
  metaToPost,
  metaToProject,
  metaToResume,
  metaToTask,
  noteMetaSk,
  notePk,
  postPk,
  projectPk,
  removedUserSk,
  removedUsersPk,
  resumePk,
  taskMetaSk,
  taskPk,
} from '@gagnechris/data';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  HomeSchema,
  NoteSchema,
  POWERTOOLS_METRICS_NAMESPACE,
  RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES,
  RESTORE_TEST_METRICS,
  RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES,
  RESTORE_TEST_SERVICE_NAME,
  RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES,
  RESTORE_TEST_TABLE_PREFIX,
  PostSchema,
  ProjectSchema,
  ResumeSchema,
  SyncChangeSchema,
  TaskSchema,
  type Project,
} from '@gagnechris/shared';
import { legacyResumeContent } from '@gagnechris/shared/fixtures/legacy-resume';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../go/internal/contract/contract.json',
);

const ITEM_SCHEMAS: Record<
  (typeof RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES)[number],
  z.ZodType
> = {
  post: PostMetaItemSchema,
  project: ProjectMetaItemSchema,
  home: HomeMetaItemSchema,
  removedUser: RemovedUserItemSchema,
  resume: ResumeMetaItemSchema,
  contact: ContactMsgItemSchema,
  note: NoteMetaItemSchema,
  task: TaskMetaItemSchema,
  dailyNoteClaim: DailyNoteClaimItemSchema,
  dailyTemplate: DailyTemplateItemSchema,
};

// Placeholders in braces; Go fills its builders with the same values.
const KEYS: Record<string, string> = {
  SK_META,
  SK_PUBLISHED,
  'postPk({postId})': postPk('{postId}'),
  'projectPk({projectId})': projectPk('{projectId}'),
  'homePk()': homePk(),
  'resumePk()': resumePk(),
  'contactPk({contactId})': contactPk('{contactId}'),
  'contactMsgSk()': contactMsgSk(),
  'removedUsersPk()': removedUsersPk(),
  'removedUserSk({userId})': removedUserSk('{userId}'),
  'notePk({userId},{noteId})': notePk('{userId}', '{noteId}'),
  'noteMetaSk()': noteMetaSk(),
  'taskPk({userId},{taskId})': taskPk('{userId}', '{taskId}'),
  'taskMetaSk()': taskMetaSk(),
  'dailyNoteClaimPk({userId},{area},{date})': dailyNoteClaimPk(
    '{userId}',
    '{area}',
    '{date}',
  ),
  'dailyNoteClaimSk()': dailyNoteClaimSk(),
  'dailyTemplatePk({userId},{area})': dailyTemplatePk('{userId}', '{area}'),
  'dailyTemplateSk()': dailyTemplateSk(),
};

const USER = 'user-sub-1';
const TS = '2026-10-01T12:00:00.000Z';

const note = (
  id: string,
  type: 'daily' | 'page',
  date: string | null,
  ts = TS,
) =>
  buildNoteMetaItem({
    id,
    userId: USER,
    area: 'work',
    type,
    date,
    title: type === 'daily' ? 'Daily' : 'Page',
    bodyMarkdown: 'private text',
    tags: [],
    pinned: false,
    taskIds: [],
    version: 3,
    createdAt: ts,
    updatedAt: ts,
    deleted: false,
  });

const project: Project = {
  id: '01PROJECT',
  slug: 'notebook',
  name: 'Notebook',
  pitch: '',
  stage: 'building',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: '',
  stack: [],
  links: [],
  demo: null,
  order: 0,
  href: null,
  status: 'published',
  publishedAt: TS,
  updatedAt: TS,
  version: 2,
  hasUnpublishedChanges: false,
};

const taggedPost = buildPublishedItem({
  id: '01POST',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: '',
  tags: [],
  projectIds: ['01PROJECT'],
  status: 'published',
  publishedAt: TS,
  updatedAt: TS,
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
});
const { projectIds: _projectIds, ...untaggedPost } = taggedPost;

const legacyResume = {
  ...DEFAULT_RESUME,
  content: legacyResumeContent() as typeof DEFAULT_RESUME.content,
  updatedAt: TS,
  version: 1,
};

const SAMPLES: Record<string, Record<string, unknown>> = {
  home: buildHomeMetaItem({ ...DEFAULT_HOME, updatedAt: TS, version: 1 }),
  resume: buildResumeMetaItem({ ...DEFAULT_RESUME, updatedAt: TS, version: 1 }),
  resumePublished: buildResumePublishedItem({
    ...DEFAULT_RESUME,
    updatedAt: TS,
    version: 1,
  }),
  resumeLegacy: buildResumeMetaItem(legacyResume),
  resumeLegacyPublished: buildResumePublishedItem(legacyResume),
  noteDaily: note('01NOTE', 'daily', '2026-10-01'),
  notePage: note('01PAGE', 'page', null),
  task: buildTaskMetaItem({
    id: '01TASK',
    userId: USER,
    area: 'work',
    title: 'Do it',
    description: '',
    priority: 'med',
    status: 'todo',
    dueDate: null,
    startDate: null,
    someday: false,
    completedAt: null,
    noteId: '01NOTE',
    tags: [],
    version: 1,
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
  }),
  dailyNoteClaim: buildDailyNoteClaimItem(USER, 'work', '2026-10-01', '01NOTE'),
  dailyTemplate: buildDailyTemplateItem(USER, {
    area: 'work',
    bodyMarkdown: '## Today',
    isDefault: false,
    version: 2,
    createdAt: TS,
    updatedAt: TS,
  }),
  project: buildProjectMetaItem(project),
  projectPublished: buildProjectPublishedItem(project),
  postTagged: taggedPost,
  postUntagged: untaggedPost,
  contact: {
    pk: contactPk('01CONTACT'),
    sk: contactMsgSk(),
    entityType: 'contact',
    contactId: '01CONTACT',
    name: 'Ada',
    email: 'ada@example.com',
    message: 'Hello',
    sourceIp: '203.0.113.1',
    createdAt: TS,
    emailStatus: 'sent',
  },
  removedUser: {
    pk: removedUsersPk(),
    sk: removedUserSk('user-sub-2'),
    entityType: 'removedUser',
    userId: 'user-sub-2',
    email: 'old@example.com',
    previousLevel: null,
    createdAt: TS,
    removedBy: USER,
  },
};

for (const [name, item] of Object.entries(SAMPLES)) {
  const schema = ITEM_SCHEMAS[item.entityType as keyof typeof ITEM_SCHEMAS];
  const parsed = schema?.safeParse(item);
  if (!parsed?.success) {
    throw new Error(`sample ${name} does not parse: ${parsed?.error.message}`);
  }
}

const apiNote = metaToNote(
  SAMPLES.noteDaily as Parameters<typeof metaToNote>[0],
);
const apiTask = {
  ...metaToTask(SAMPLES.task as Parameters<typeof metaToTask>[0]),
  id: '01K6G0000000000000000TASK0',
};

// API response bodies; Go decodes and re-encodes each to prove its generated
// types carry every field.
const API_SAMPLES: Record<string, [z.ZodType, unknown]> = {
  post: [
    PostSchema,
    metaToPost(taggedPost as Parameters<typeof metaToPost>[0], true),
  ],
  project: [
    ProjectSchema,
    metaToProject(SAMPLES.project as Parameters<typeof metaToProject>[0]),
  ],
  home: [
    HomeSchema,
    metaToHome(SAMPLES.home as Parameters<typeof metaToHome>[0]),
  ],
  resume: [
    ResumeSchema,
    metaToResume(SAMPLES.resume as Parameters<typeof metaToResume>[0]),
  ],
  note: [NoteSchema, apiNote],
  task: [TaskSchema, apiTask],
  syncNote: [
    SyncChangeSchema,
    {
      type: 'note',
      id: apiNote.id,
      version: apiNote.version,
      updatedAt: apiNote.updatedAt,
      deleted: false,
      entity: apiNote,
    },
  ],
  syncTask: [
    SyncChangeSchema,
    {
      type: 'task',
      id: apiTask.id,
      version: apiTask.version,
      updatedAt: apiTask.updatedAt,
      deleted: false,
      entity: apiTask,
    },
  ],
  syncTaskDeleted: [
    SyncChangeSchema,
    {
      type: 'task',
      id: apiTask.id,
      version: apiTask.version + 1,
      updatedAt: apiTask.updatedAt,
      deleted: true,
    },
  ],
};

for (const [name, [schema, body]] of Object.entries(API_SAMPLES)) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `api sample ${name} does not parse: ${parsed.error.message}`,
    );
  }
}

const contract = {
  restoreTest: {
    serviceName: RESTORE_TEST_SERVICE_NAME,
    metricsNamespace: POWERTOOLS_METRICS_NAMESPACE,
    metrics: RESTORE_TEST_METRICS,
    tablePrefix: RESTORE_TEST_TABLE_PREFIX,
    schemaCheckedEntityTypes: RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES,
    countFloorEntityTypes: RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES,
    sourceCountAttributes: RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES,
  },
  keys: KEYS,
  itemSchemas: Object.fromEntries(
    RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES.map((type) => [
      type,
      z.toJSONSchema(ITEM_SCHEMAS[type], {
        io: 'input',
        unrepresentable: 'throw',
      }),
    ]),
  ),
  samples: SAMPLES,
  apiSamples: Object.fromEntries(
    Object.entries(API_SAMPLES).map(([name, [, body]]) => [name, body]),
  ),
};

writeFileSync(OUT, `${JSON.stringify(contract, null, 2)}\n`);
