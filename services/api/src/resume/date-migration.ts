import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  planResumeDateMigration,
  type ResumeDateMigrationRow,
} from '@gagnechris/shared';
import {
  isOptimisticLockConflict,
  ResumeMetaItemSchema,
  resumeMetaSk,
  resumePk,
  resumePublishedSk,
} from '@gagnechris/data';
import { nowIso } from '../data/publishable-repository.js';
import {
  VERSION_MATCH_CONDITION,
  versionMatchValues,
} from '../data/version-condition.js';

export type ResumeDateMigrationMode = 'dry-run' | 'apply' | 'verify';

export type ResumeRowReport = {
  sk: string;
  status:
    'missing' | 'invalid' | 'up-to-date' | 'pending' | 'written' | 'conflict';
  version?: number;
  nextVersion?: number;
  experience: ResumeDateMigrationRow[];
};

export type ResumeDateMigrationReport = {
  table: string;
  mode: ResumeDateMigrationMode;
  rows: ResumeRowReport[];
  unparseable: number;
};

type Planned = {
  report: ResumeRowReport;
  write?: {
    sk: string;
    version: number;
    content: unknown;
    touchUpdatedAt: boolean;
  };
};

const planRow = async (
  doc: DynamoDBDocumentClient,
  tableName: string,
  sk: string,
): Promise<Planned> => {
  const { Item } = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: resumePk(), sk },
      ConsistentRead: true,
    }),
  );
  if (!Item) return { report: { sk, status: 'missing', experience: [] } };
  const parsed = ResumeMetaItemSchema.safeParse(Item);
  if (!parsed.success) {
    return { report: { sk, status: 'invalid', experience: [] } };
  }
  const version = parsed.data.version;
  const plan = planResumeDateMigration(parsed.data.content);
  if (!plan.changed) {
    return {
      report: { sk, status: 'up-to-date', version, experience: plan.rows },
    };
  }
  return {
    report: {
      sk,
      status: 'pending',
      version,
      nextVersion: version + 1,
      experience: plan.rows,
    },
    write: {
      sk,
      version,
      content: plan.content,
      // PUBLISHED keeps its timestamps: the PDF's dates are pinned to them.
      touchUpdatedAt: sk === resumeMetaSk(),
    },
  };
};

/**
 * Moves `Company | Month YYYY - Month YYYY` out of experience `company` into
 * `start`/`end` on the draft and PUBLISHED resume rows. Both rows are written
 * in one transaction, each conditional on the version it was read at.
 */
export async function migrateResumeDates(opts: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  mode: ResumeDateMigrationMode;
  now?: () => string;
}): Promise<ResumeDateMigrationReport> {
  const { doc, tableName, mode } = opts;
  const now = opts.now ?? nowIso;
  const planned = [
    await planRow(doc, tableName, resumeMetaSk()),
    await planRow(doc, tableName, resumePublishedSk()),
  ];
  const writes = planned.flatMap((p) => (p.write ? [p.write] : []));

  if (mode === 'apply' && writes.length > 0) {
    const stamp = now();
    try {
      await doc.send(
        new TransactWriteCommand({
          TransactItems: writes.map((w) => ({
            Update: {
              TableName: tableName,
              Key: { pk: resumePk(), sk: w.sk },
              UpdateExpression: w.touchUpdatedAt
                ? 'SET content = :content, version = :next, updatedAt = :now'
                : 'SET content = :content, version = :next',
              ConditionExpression: VERSION_MATCH_CONDITION,
              ExpressionAttributeValues: {
                ...versionMatchValues(w.version),
                ':content': w.content,
                ':next': w.version + 1,
                ...(w.touchUpdatedAt ? { ':now': stamp } : {}),
              },
            },
          })),
        }),
      );
      for (const p of planned) {
        if (p.write) p.report.status = 'written';
      }
    } catch (error) {
      if (!isOptimisticLockConflict(error)) throw error;
      for (const p of planned) {
        if (p.write) p.report.status = 'conflict';
      }
    }
  }

  const rows = planned.map((p) => p.report);
  return {
    table: tableName,
    mode,
    rows,
    unparseable: rows.reduce(
      (n, r) =>
        n + r.experience.filter((e) => e.status === 'unparseable').length,
      0,
    ),
  };
}

/** 0 ok; 1 a write lost a race (re-run); 2 rows still need attention. */
export function resumeDateMigrationExitCode(
  report: ResumeDateMigrationReport,
): number {
  if (report.rows.some((r) => r.status === 'conflict')) return 1;
  if (report.mode !== 'verify') return 0;
  const outstanding = report.rows.some(
    (r) => r.status === 'pending' || r.status === 'invalid',
  );
  return outstanding || report.unparseable > 0 ? 2 : 0;
}

/** Ids, versions, company names and dates only; never bullets or summary. */
export function formatResumeDateMigrationReport(
  report: ResumeDateMigrationReport,
): string[] {
  const lines = [`${report.mode}: table ${report.table}`];
  for (const row of report.rows) {
    const version =
      row.version === undefined
        ? ''
        : row.nextVersion === undefined
          ? ` v${row.version}`
          : ` v${row.version} -> v${row.nextVersion}`;
    lines.push(`${resumePk()} ${row.sk}: ${row.status}${version}`);
    for (const e of row.experience) {
      lines.push(
        e.status === 'unparseable'
          ? `  [${e.index}] unparseable (${e.reason}): ${JSON.stringify(e.company)}`
          : `  [${e.index}] ${e.status.padEnd(8)} ${JSON.stringify(e.company)} start=${e.start} end=${e.end ?? 'present'}`,
      );
    }
  }
  return lines;
}
