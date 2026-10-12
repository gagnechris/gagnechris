import {
  DeleteCommand,
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export type TagRowCleanupMode = 'dry-run' | 'apply' | 'verify';

export type TagRowCleanupReport = {
  table: string;
  mode: TagRowCleanupMode;
  scanned: number;
  tagRows: number;
  deleted: number;
};

// No API reads or writes these rows; the prefix and entityType together match
// only them.
const TAG_PK_PREFIX = 'TAG#';
const TAG_ENTITY_TYPE = 'tagIndex';

/** Deletes the posts' `TAG#<tag>` / `TS#…#POST#<id>` index rows. */
export async function cleanupTagRows(opts: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  mode: TagRowCleanupMode;
}): Promise<TagRowCleanupReport> {
  const { doc, tableName, mode } = opts;
  const report: TagRowCleanupReport = {
    table: tableName,
    mode,
    scanned: 0,
    tagRows: 0,
    deleted: 0,
  };
  const values = { ':prefix': TAG_PK_PREFIX, ':type': TAG_ENTITY_TYPE };

  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(pk, :prefix) AND entityType = :type',
        ExpressionAttributeValues: values,
        ProjectionExpression: 'pk, sk',
        ExclusiveStartKey: exclusiveStartKey,
        ConsistentRead: true,
      }),
    );
    report.scanned += page.ScannedCount ?? 0;
    for (const row of page.Items ?? []) {
      report.tagRows += 1;
      if (mode !== 'apply') continue;
      await doc.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk: row.pk, sk: row.sk },
        }),
      );
      report.deleted += 1;
    }
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return report;
}

/** 0 ok; 2 verify found tag rows. */
export function tagRowCleanupExitCode(report: TagRowCleanupReport): number {
  return report.mode === 'verify' && report.tagRows > 0 ? 2 : 0;
}
