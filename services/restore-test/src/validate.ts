// Never logs or reports item content, only keys and issue paths.
import type { z } from 'zod';
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
  contactMsgSk,
  contactPk,
  dailyNoteClaimPk,
  dailyNoteClaimSk,
  dailyTemplatePk,
  dailyTemplateSk,
  homePk,
  keys,
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

export const RESTORE_TEST_TABLE_PREFIX = 'awsbackup-restore-test-';

export const DEFAULT_MAX_SCAN_ITEMS = 50_000;

export const MAX_MESSAGE_LENGTH = 900;

const MAX_LISTED_PROBLEMS = 10;

export type ScanPage = {
  Items?: Record<string, unknown>[];
  LastEvaluatedKey?: Record<string, unknown>;
};

export type ScanFn = (input: {
  TableName: string;
  ExclusiveStartKey?: Record<string, unknown>;
}) => Promise<ScanPage>;

export type CountInput = {
  TableName: string;
  Select: 'COUNT';
  FilterExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
  ExclusiveStartKey?: Record<string, unknown>;
};

export type CountFn = (input: CountInput) => Promise<{
  Count?: number;
  LastEvaluatedKey?: Record<string, unknown>;
}>;

export type ValidationStatus = 'SUCCESSFUL' | 'FAILED';

export type ValidationResult = {
  status: ValidationStatus;
  message: string;
  itemCount: number;
  schemaChecked: number;
  problems: string[];
  floorChecked?: boolean;
};

type KeyCheck = (item: Record<string, unknown>) => boolean;

type EntityRule = {
  schema: z.ZodType;
  keyMatches: KeyCheck;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const ENTITY_RULES: Record<string, EntityRule> = {
  post: {
    schema: PostMetaItemSchema,
    keyMatches: (i) =>
      i.pk === postPk(str(i.postId)) &&
      (i.sk === SK_META || i.sk === SK_PUBLISHED),
  },
  project: {
    schema: ProjectMetaItemSchema,
    keyMatches: (i) =>
      i.pk === projectPk(str(i.projectId)) &&
      (i.sk === SK_META || i.sk === SK_PUBLISHED),
  },
  home: {
    schema: HomeMetaItemSchema,
    keyMatches: (i) =>
      i.pk === homePk() && (i.sk === SK_META || i.sk === SK_PUBLISHED),
  },
  removedUser: {
    schema: RemovedUserItemSchema,
    keyMatches: (i) =>
      i.pk === removedUsersPk() && i.sk === removedUserSk(str(i.userId)),
  },
  resume: {
    schema: ResumeMetaItemSchema,
    keyMatches: (i) =>
      i.pk === resumePk() && (i.sk === SK_META || i.sk === SK_PUBLISHED),
  },
  contact: {
    schema: ContactMsgItemSchema,
    keyMatches: (i) =>
      i.pk === contactPk(str(i.contactId)) && i.sk === contactMsgSk(),
  },
  note: {
    schema: NoteMetaItemSchema,
    keyMatches: (i) =>
      i.pk === notePk(str(i.userId), str(i.id)) && i.sk === noteMetaSk(),
  },
  task: {
    schema: TaskMetaItemSchema,
    keyMatches: (i) =>
      i.pk === taskPk(str(i.userId), str(i.id)) && i.sk === taskMetaSk(),
  },
  dailyNoteClaim: {
    schema: DailyNoteClaimItemSchema,
    keyMatches: (i) =>
      i.pk === dailyNoteClaimPk(str(i.userId), str(i.area), str(i.date)) &&
      i.sk === dailyNoteClaimSk(),
  },
  dailyTemplate: {
    schema: DailyTemplateItemSchema,
    keyMatches: (i) =>
      i.pk === dailyTemplatePk(str(i.userId), str(i.area)) &&
      i.sk === dailyTemplateSk(),
  },
};

export const SCHEMA_CHECKED_ENTITY_TYPES: readonly string[] =
  Object.keys(ENTITY_RULES);

/**
 * Types whose rows carry `createdAt` or `updatedAt`, so the source can say
 * which rows provably existed at the restore point. Daily claims have neither.
 */
export const COUNT_FLOOR_ENTITY_TYPES: readonly string[] = [
  'post',
  'project',
  'home',
  'resume',
  'contact',
  'removedUser',
  'note',
  'task',
  'dailyTemplate',
];

export const COUNT_FLOOR_FRACTION = 0.9;

/** Covers API writes whose timestamp is stamped before they commit. */
export const COUNT_FLOOR_SETTLE_MS = 5 * 60_000;

export function minRestoredCount(existedAtRestorePoint: number): number {
  return Math.ceil(existedAtRestorePoint * COUNT_FLOOR_FRACTION);
}

export type CountFloor = {
  count: CountFn;
  sourceTable: string;
  restorePoint: Date;
};

export async function countSourceRowsExistingAt(
  count: CountFn,
  sourceTable: string,
  entityType: string,
  cutoffIso: string,
): Promise<number> {
  let total = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await count({
      TableName: sourceTable,
      Select: 'COUNT',
      // A row written at or before the cutoff existed at the restore point.
      FilterExpression: '#t = :t AND (#c <= :cut OR #u <= :cut)',
      ExpressionAttributeNames: {
        '#t': 'entityType',
        '#c': 'createdAt',
        '#u': 'updatedAt',
      },
      ExpressionAttributeValues: { ':t': entityType, ':cut': cutoffIso },
      ...(startKey ? { ExclusiveStartKey: startKey } : {}),
    });
    total += page.Count ?? 0;
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return total;
}

export async function countFloorProblems(
  floor: CountFloor,
  restoredByType: ReadonlyMap<string, number>,
): Promise<string[]> {
  const cutoffIso = new Date(
    floor.restorePoint.getTime() - COUNT_FLOOR_SETTLE_MS,
  ).toISOString();
  const problems: string[] = [];
  for (const entityType of COUNT_FLOOR_ENTITY_TYPES) {
    const existed = await countSourceRowsExistingAt(
      floor.count,
      floor.sourceTable,
      entityType,
      cutoffIso,
    );
    const restored = restoredByType.get(entityType) ?? 0;
    const min = minRestoredCount(existed);
    if (restored < min) {
      problems.push(
        `${entityType} count ${restored} below floor ${min} (${existed} in ${floor.sourceTable} before ${cutoffIso})`,
      );
    }
  }
  return problems;
}

export const REQUIRED_KEYS: ReadonlyArray<{ pk: string; sk: string }> = [
  keys.singleton.home.meta(),
  keys.singleton.resume.meta(),
];

export function isRestoreTestTableName(name: string): boolean {
  return (
    name.startsWith(RESTORE_TEST_TABLE_PREFIX) &&
    name.length > RESTORE_TEST_TABLE_PREFIX.length
  );
}

export function tableNameFromArn(arn: string | undefined): string | undefined {
  if (!arn) return undefined;
  const match = /:table\/([^/]+)$/.exec(arn);
  return match?.[1];
}

function keyLabel(item: Record<string, unknown>): string {
  return `${str(item.pk) || '?'}/${str(item.sk) || '?'}`;
}

export function checkItem(item: Record<string, unknown>): string | undefined {
  if (typeof item.pk !== 'string' || item.pk.length === 0) {
    return 'item without a string pk';
  }
  if (typeof item.sk !== 'string' || item.sk.length === 0) {
    return `${item.pk}: missing string sk`;
  }
  const entityType = str(item.entityType);
  const rule = ENTITY_RULES[entityType];
  if (!rule) return undefined;
  const parsed = rule.schema.safeParse(item);
  if (!parsed.success) {
    // Issue paths only: values may be private note text.
    const paths = parsed.error.issues
      .slice(0, 3)
      .map((issue) => issue.path.join('.') || '(root)')
      .join(',');
    return `${keyLabel(item)}: ${entityType} schema (${paths})`;
  }
  if (!rule.keyMatches(item)) {
    return `${keyLabel(item)}: ${entityType} key does not match key builders`;
  }
  return undefined;
}

export function isSchemaChecked(item: Record<string, unknown>): boolean {
  return str(item.entityType) in ENTITY_RULES;
}

function buildMessage(result: Omit<ValidationResult, 'message'>): string {
  const head =
    result.status === 'SUCCESSFUL'
      ? `OK: ${result.itemCount} items, ${result.schemaChecked} schema-checked, singletons present${result.floorChecked ? ', counts at floor' : ''}`
      : `FAILED: ${result.problems.length} problem(s) in ${result.itemCount} items`;
  if (result.problems.length === 0) return head;
  const listed = result.problems.slice(0, MAX_LISTED_PROBLEMS).join('; ');
  const more =
    result.problems.length > MAX_LISTED_PROBLEMS
      ? `; +${result.problems.length - MAX_LISTED_PROBLEMS} more`
      : '';
  const message = `${head}: ${listed}${more}`;
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : message;
}

export function finalize(
  partial: Omit<ValidationResult, 'message' | 'status'>,
): ValidationResult {
  const status: ValidationStatus =
    partial.problems.length === 0 ? 'SUCCESSFUL' : 'FAILED';
  const withStatus = { ...partial, status };
  return { ...withStatus, message: buildMessage(withStatus) };
}

export async function validateRestoredTable(
  scan: ScanFn,
  tableName: string,
  opts: { maxItems?: number; floor?: CountFloor } = {},
): Promise<ValidationResult> {
  if (!isRestoreTestTableName(tableName)) {
    return finalize({
      itemCount: 0,
      schemaChecked: 0,
      problems: [
        `refusing to validate "${tableName}": not an ${RESTORE_TEST_TABLE_PREFIX}* table`,
      ],
    });
  }
  const maxItems = opts.maxItems ?? DEFAULT_MAX_SCAN_ITEMS;
  const problems: string[] = [];
  const seen = new Set<string>();
  const required = new Set(REQUIRED_KEYS.map((k) => `${k.pk}/${k.sk}`));
  const restoredByType = new Map<string, number>();
  let itemCount = 0;
  let schemaChecked = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await scan({
      TableName: tableName,
      ...(startKey ? { ExclusiveStartKey: startKey } : {}),
    });
    for (const item of page.Items ?? []) {
      itemCount += 1;
      if (isSchemaChecked(item)) schemaChecked += 1;
      const entityType = str(item.entityType);
      restoredByType.set(entityType, (restoredByType.get(entityType) ?? 0) + 1);
      const problem = checkItem(item);
      if (problem) problems.push(problem);
      const label = keyLabel(item);
      if (required.has(label)) seen.add(label);
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey && itemCount < maxItems);

  if (startKey) {
    problems.push(`scan stopped after ${itemCount} items (maxItems)`);
  }
  if (itemCount === 0) {
    problems.unshift('restored table is empty');
  }
  for (const key of required) {
    if (!seen.has(key)) problems.push(`missing required row ${key}`);
  }
  // A truncated scan undercounts every type; its own problem is enough.
  const floor = startKey ? undefined : opts.floor;
  if (floor) {
    problems.push(...(await countFloorProblems(floor, restoredByType)));
  }
  return finalize({
    itemCount,
    schemaChecked,
    problems,
    ...(floor ? { floorChecked: true } : {}),
  });
}
