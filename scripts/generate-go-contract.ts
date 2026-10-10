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
  notebookAreaGsi1Pk,
  postPk,
  projectOrderGsi1Sk,
  projectPk,
  projectSlugClaimSk,
  projectSlugPk,
  projectStatusGsi1Pk,
  rateContactIpPk,
  rateDaySk,
  rateHourSk,
  rateResumeIpPk,
  rateSesGlobalPk,
  removedUserSk,
  removedUsersPk,
  resumePk,
  slugRedirectSk,
  taskMetaSk,
  taskPk,
  taskAreaStatusGsi1Pk,
  ttlEndOfUtcDay,
  ttlEndOfUtcHour,
} from '@gagnechris/data';
import {
  ACCESS_GROUPS,
  ACCESS_LEVEL_GROUPS,
  API_SERVICE_NAME,
  APEX_DOMAIN,
  CONTACT_PER_IP_PER_HOUR,
  DEFAULT_HOME,
  DEFAULT_RESUME,
  HomeSchema,
  LINK_HREF_MAX_LENGTH,
  MAX_SLUG_LENGTH,
  MIN_CONTACT_SUBMIT_MS,
  NoteSchema,
  POST_LINK_SCHEMES,
  POWERTOOLS_METRICS_NAMESPACE,
  PROJECT_DEMO_IDS,
  PROJECT_HREF_SCHEMES,
  PROJECT_LINK_LABEL_MAX_LENGTH,
  PROJECT_LINKS_MAX,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_ORDER_MAX,
  PROJECT_PITCH_MAX_LENGTH,
  PROJECT_STACK_ITEM_MAX_LENGTH,
  PROJECT_STACK_MAX,
  PROJECT_STAGE_NOTE_MAX_LENGTH,
  REAUTH_REQUIRED,
  RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES,
  RESTORE_TEST_METRICS,
  RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES,
  RESTORE_TEST_SERVICE_NAME,
  RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES,
  RESTORE_TEST_TABLE_PREFIX,
  PostSchema,
  ProjectSchema,
  ResumeSchema,
  SES_GLOBAL_DAILY_CAP,
  SyncChangeSchema,
  TaskSchema,
  USER_ADMIN_REAUTH_SECONDS,
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

// Late in the UTC day, so a builder that rounds the wrong way crosses midnight.
const KEY_TIME = '2026-01-02T23:04:05.678Z';

// Placeholders in braces; Go fills its builders with the same values.
const KEYS: Record<string, string> = {
  SK_META,
  SK_PUBLISHED,
  'postPk({postId})': postPk('{postId}'),
  'projectPk({projectId})': projectPk('{projectId}'),
  'projectSlugPk({slug})': projectSlugPk('{slug}'),
  'projectSlugClaimSk()': projectSlugClaimSk(),
  'slugRedirectSk()': slugRedirectSk(),
  'projectStatusGsi1Pk({status})': projectStatusGsi1Pk('{status}'),
  'projectOrderGsi1Sk(42,{projectId})': projectOrderGsi1Sk(42, '{projectId}'),
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
  'notebookAreaGsi1Pk({userId},{area})': notebookAreaGsi1Pk(
    '{userId}',
    '{area}',
  ),
  'taskAreaStatusGsi1Pk({userId},{area},{status})': taskAreaStatusGsi1Pk(
    '{userId}',
    '{area}',
    '{status}',
  ),
  'dailyNoteClaimPk({userId},{area},{date})': dailyNoteClaimPk(
    '{userId}',
    '{area}',
    '{date}',
  ),
  'dailyNoteClaimSk()': dailyNoteClaimSk(),
  'dailyTemplatePk({userId},{area})': dailyTemplatePk('{userId}', '{area}'),
  'dailyTemplateSk()': dailyTemplateSk(),
  'rateContactIpPk({ip})': rateContactIpPk('{ip}'),
  'rateResumeIpPk({ip})': rateResumeIpPk('{ip}'),
  'rateSesGlobalPk()': rateSesGlobalPk(),
  [`rateHourSk(${KEY_TIME})`]: rateHourSk(new Date(KEY_TIME)),
  [`rateDaySk(${KEY_TIME})`]: rateDaySk(new Date(KEY_TIME)),
  [`ttlEndOfUtcHour(${KEY_TIME})`]: String(ttlEndOfUtcHour(new Date(KEY_TIME))),
  [`ttlEndOfUtcDay(${KEY_TIME})`]: String(ttlEndOfUtcDay(new Date(KEY_TIME))),
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
  api: {
    serviceName: API_SERVICE_NAME,
    metricsNamespace: POWERTOOLS_METRICS_NAMESPACE,
    apexDomain: APEX_DOMAIN,
    contactPerIpPerHour: CONTACT_PER_IP_PER_HOUR,
    sesGlobalDailyCap: SES_GLOBAL_DAILY_CAP,
    minContactSubmitMs: MIN_CONTACT_SUBMIT_MS,
  },
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
  limits: {
    maxSlugLength: MAX_SLUG_LENGTH,
    linkHrefMaxLength: LINK_HREF_MAX_LENGTH,
    postLinkSchemes: POST_LINK_SCHEMES,
    projectHrefSchemes: PROJECT_HREF_SCHEMES,
    projectNameMaxLength: PROJECT_NAME_MAX_LENGTH,
    projectPitchMaxLength: PROJECT_PITCH_MAX_LENGTH,
    projectStageNoteMaxLength: PROJECT_STAGE_NOTE_MAX_LENGTH,
    projectStackMax: PROJECT_STACK_MAX,
    projectStackItemMaxLength: PROJECT_STACK_ITEM_MAX_LENGTH,
    projectLinksMax: PROJECT_LINKS_MAX,
    projectLinkLabelMaxLength: PROJECT_LINK_LABEL_MAX_LENGTH,
    projectOrderMax: PROJECT_ORDER_MAX,
    projectDemoIds: PROJECT_DEMO_IDS,
  },
  // What Home and Resume read as before their first save.
  defaults: { home: DEFAULT_HOME, resume: DEFAULT_RESUME },
  users: {
    accessGroups: ACCESS_GROUPS,
    accessLevelGroups: ACCESS_LEVEL_GROUPS,
    reauthSeconds: USER_ADMIN_REAUTH_SECONDS,
    reauthRequired: REAUTH_REQUIRED,
  },
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
