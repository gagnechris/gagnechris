/**
 * Writes services/api/internal/contract/contract.json: what the Go code must agree on
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
  SYNC_CREATE_CLAIM_TTL_DAYS,
  SYNC_OVERLAP_MS,
  SYNC_RESYNC_MARGIN_MS,
  SYNC_TOMBSTONE_TTL_DAYS,
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
  normalizeTags,
  noteMetaSk,
  notePk,
  noteDateGsi1Sk,
  notePageGsi1Sk,
  noteTasksGsi2Pk,
  noteTasksGsi2Sk,
  notebookAreaGsi1Pk,
  ownerSyncCreateClaimPk,
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
  sitePublishPk,
  sitePublishSk,
  slugPk,
  slugPostSk,
  slugRedirectSk,
  statusGsi1Pk,
  statusGsi1Sk,
  syncCreateClaimSk,
  syncPk,
  tagPk,
  tagSk,
  taskMetaSk,
  taskPk,
  taskAreaStatusGsi1Pk,
  taskSomedayGsi1Sk,
  taskStartGsi1Sk,
  taskUpdatedGsi1Sk,
  ttlEndOfUtcDay,
  ttlEndOfUtcHour,
} from '@gagnechris/data';
import {
  ACCESS_GROUPS,
  ACCESS_LEVEL_GROUPS,
  API_SERVICE_NAME,
  APEX_DOMAIN,
  CLIENT_VERSION_HEADER,
  CONTACT_PER_IP_PER_HOUR,
  DAILY_TEMPLATE_MAX_BYTES,
  DAILY_TEMPLATE_TASK_MESSAGE,
  DEFAULT_DAILY_TEMPLATES,
  carriedInMarkdown,
  dailyTemplateHasTasks,
  fillDailyTemplate,
  taskEmbedIds,
  DEFAULT_HOME,
  DEFAULT_RESUME,
  HomeSchema,
  LINK_HREF_MAX_LENGTH,
  MAX_SLUG_LENGTH,
  MIN_CONTACT_SUBMIT_MS,
  NOTEBOOK_BATCH_MAX_IDS,
  NOTEBOOK_PAGE_SIZE,
  NOTEBOOK_TAG_MAX_LENGTH,
  NOTEBOOK_TAGS_MAX,
  NOTEBOOK_TEXT_MAX_BYTES,
  NOTEBOOK_TITLE_MAX_LENGTH,
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
  RESUME_NOTIFY_SES_DAILY_CAP,
  SYNC_DEFAULT_PAGE_LIMIT,
  SYNC_MIN_CLIENT_VERSION,
  SYNC_CHANGE_TYPES,
  SyncChangeSchema,
  TaskSchema,
  USER_ADMIN_REAUTH_SECONDS,
  type Project,
} from '@gagnechris/shared';
import { legacyResumeContent } from '@gagnechris/shared/fixtures/legacy-resume';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../services/api/internal/contract/contract.json',
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
  'slugPk({slug})': slugPk('{slug}'),
  'slugPostSk()': slugPostSk(),
  'tagPk({tag})': tagPk('{tag}'),
  'tagSk({publishedAt},{postId})': tagSk('{publishedAt}', '{postId}'),
  'statusGsi1Pk({status})': statusGsi1Pk('{status}'),
  'statusGsi1Sk({sortTs},{postId})': statusGsi1Sk('{sortTs}', '{postId}'),
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
  'sitePublishPk()': sitePublishPk(),
  'sitePublishSk()': sitePublishSk(),
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
  'noteDateGsi1Sk({date},{noteId})': noteDateGsi1Sk('{date}', '{noteId}'),
  'notePageGsi1Sk({updatedAt},{noteId})': notePageGsi1Sk(
    '{updatedAt}',
    '{noteId}',
  ),
  'taskStartGsi1Sk({date},{taskId})': taskStartGsi1Sk('{date}', '{taskId}'),
  'taskUpdatedGsi1Sk({updatedAt},{taskId})': taskUpdatedGsi1Sk(
    '{updatedAt}',
    '{taskId}',
  ),
  'taskSomedayGsi1Sk({updatedAt},{taskId})': taskSomedayGsi1Sk(
    '{updatedAt}',
    '{taskId}',
  ),
  'noteTasksGsi2Pk({userId},{noteId})': noteTasksGsi2Pk('{userId}', '{noteId}'),
  'noteTasksGsi2Sk({taskId})': noteTasksGsi2Sk('{taskId}'),
  'syncPk({userId})': syncPk('{userId}'),
  'ownerSyncCreateClaimPk({userId},task,{taskId})': ownerSyncCreateClaimPk(
    '{userId}',
    'task',
    '{taskId}',
  ),
  'syncCreateClaimSk()': syncCreateClaimSk(),
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

const EMBED_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EMBED_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const TEMPLATE_WITH_TOKENS =
  '# {{weekday}} {{date}} ({{area}}) {{other}} {{date}}';

// The TypeScript helpers' outputs, so the Go ports are tested against them.
const TEXT_CASES = {
  taskEmbedIds: [
    `{{task:${EMBED_ID}}}`,
    `  {{task:${EMBED_ID.toLowerCase()}}} \r\n\t{{task:${EMBED_ID_2}}}\n{{task:${EMBED_ID}}}`,
    `\`\`\`\n{{task:${EMBED_ID}}}\n\`\`\`\n~~~~\n{{task:${EMBED_ID_2}}}\n~~~\n{{task:${EMBED_ID_2}}}`,
    `- {{task:${EMBED_ID}}}\ntext {{task:${EMBED_ID}}}\n{{task:01ARZ3NDEKTSV4RRFFQ69G5FAI}}`,
    `{{task:${EMBED_ID}}}\u00a0\n\u3000{{task:${EMBED_ID_2}}}`,
  ].map((input) => ({ input, want: taskEmbedIds(input) })),
  carriedInMarkdown: [[EMBED_ID], [EMBED_ID.toLowerCase(), EMBED_ID_2]].map(
    (input) => ({ input, want: carriedInMarkdown(input) }),
  ),
  normalizeTags: [
    ['Work', ' work ', 'Big  Idea', 'big-idea', ''],
    ['\u00a0Ünïcode\u2028Tag\ufeff', 'İstanbul', 'ΣΊΣΥΦΟΣ', 'tab\tsep', '   '],
  ].map((input) => ({ input, want: normalizeTags(input) })),
  fillDailyTemplate: (
    [
      ['work', '2026-10-06'],
      ['personal', '2024-02-29'],
      ['work', '2027-01-01'],
    ] as const
  ).map(([area, date]) => ({
    input: { markdown: TEMPLATE_WITH_TOKENS, area, date },
    want: fillDailyTemplate(TEMPLATE_WITH_TOKENS, { area, date }),
  })),
  dailyTemplateHasTasks: [
    '- [ ] checklist\n* [x] done',
    '[ ] task line',
    '  \t[ ] indented task',
    '[ ]',
    '[ ]   ',
    '```\n[ ] in a fence\n```',
    `{{task:${EMBED_ID}}}`,
    `~~~\n{{task:${EMBED_ID}}}\n~~~`,
    '[x] not a task line',
  ].map((input) => ({ input, want: dailyTemplateHasTasks(input) })),
};

const contract = {
  api: {
    serviceName: API_SERVICE_NAME,
    metricsNamespace: POWERTOOLS_METRICS_NAMESPACE,
    apexDomain: APEX_DOMAIN,
    contactPerIpPerHour: CONTACT_PER_IP_PER_HOUR,
    sesGlobalDailyCap: SES_GLOBAL_DAILY_CAP,
    resumeNotifySesDailyCap: RESUME_NOTIFY_SES_DAILY_CAP,
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
  notebook: {
    textMaxBytes: NOTEBOOK_TEXT_MAX_BYTES,
    titleMaxLength: NOTEBOOK_TITLE_MAX_LENGTH,
    tagMaxLength: NOTEBOOK_TAG_MAX_LENGTH,
    tagsMax: NOTEBOOK_TAGS_MAX,
    batchMaxIds: NOTEBOOK_BATCH_MAX_IDS,
    pageSize: NOTEBOOK_PAGE_SIZE,
    dailyTemplates: DEFAULT_DAILY_TEMPLATES,
    dailyTemplateMaxBytes: DAILY_TEMPLATE_MAX_BYTES,
    dailyTemplateTaskMessage: DAILY_TEMPLATE_TASK_MESSAGE,
  },
  sync: {
    changeTypes: SYNC_CHANGE_TYPES,
    defaultPageLimit: SYNC_DEFAULT_PAGE_LIMIT,
    minClientVersion: SYNC_MIN_CLIENT_VERSION,
    clientVersionHeader: CLIENT_VERSION_HEADER,
    tombstoneTtlDays: SYNC_TOMBSTONE_TTL_DAYS,
    createClaimTtlDays: SYNC_CREATE_CLAIM_TTL_DAYS,
    resyncMarginMs: SYNC_RESYNC_MARGIN_MS,
    overlapMs: SYNC_OVERLAP_MS,
  },
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
  textCases: TEXT_CASES,
  apiSamples: Object.fromEntries(
    Object.entries(API_SAMPLES).map(([name, [, body]]) => [name, body]),
  ),
};

writeFileSync(OUT, `${JSON.stringify(contract, null, 2)}\n`);
