import {
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { ITEM_SCHEMAS } from '@gagnechris/data';

// Rows with no item schema in @gagnechris/data; a new entity type must be
// added to ITEM_SCHEMAS or here.
const UNSCHEMED_ENTITY_TYPES = new Set([
  'slug',
  'slugRedirect',
  'projectSlug',
  'projectSlugRedirect',
  'tagIndex',
  'sitePublish',
  'rateLimit',
  'syncCreateClaim',
]);

export type RowKey = { pk: unknown; sk: unknown };

export const rowKey = ({ pk, sk }: RowKey): string => JSON.stringify([pk, sk]);

/** Throws unless every row in the table parses with its entity type's item schema. */
export async function assertRowsMatchSchemas(
  doc: DynamoDBDocumentClient,
  tableName: string,
  corruptKeys: ReadonlySet<string> = new Set(),
): Promise<void> {
  const problems: string[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const row of page.Items ?? []) {
      if (corruptKeys.has(rowKey(row as RowKey))) continue;
      const at = `${String(row.pk)} / ${String(row.sk)}`;
      const entityType = row.entityType as string | undefined;
      if (typeof entityType !== 'string') {
        problems.push(`${at}: no entityType`);
        continue;
      }
      if (UNSCHEMED_ENTITY_TYPES.has(entityType)) continue;
      const schema = ITEM_SCHEMAS[entityType as keyof typeof ITEM_SCHEMAS];
      if (!schema) {
        problems.push(`${at}: unknown entityType ${entityType}`);
        continue;
      }
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        problems.push(`${at} (${entityType}): ${parsed.error.message}`);
      }
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  if (problems.length > 0) {
    throw new Error(
      `${tableName}: rows that do not match their item schema\n${problems.join('\n')}`,
    );
  }
}
