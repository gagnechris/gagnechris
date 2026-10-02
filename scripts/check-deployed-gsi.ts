/**
 * Compare APP_TABLE GSIs to the live prod table (CHR-174).
 *
 * CloudFormation allows at most one GSI create/delete per update. Unit tests
 * guard against LAST_DEPLOYED_GSIS, but that constant can be bumped in the same
 * PR as an unsafe multi-GSI change. This script DescribeTables the deployed
 * table so PR CDK diff fails before deploy.
 *
 * Usage (needs ReadOnly/describe on the table):
 *   npx tsx scripts/check-deployed-gsi.ts
 *   TABLE_NAME=gagnechris-prod npx tsx scripts/check-deployed-gsi.ts
 */
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  APP_TABLE,
  appTableName,
  assertAppTableGsiUpdateSafe,
  tableIndexesFromDescribeTable,
} from '@gagnechris/data';

const tableName = process.env.TABLE_NAME ?? appTableName('prod');
const region =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

const client = new DynamoDBClient({ region });
const result = await client.send(
  new DescribeTableCommand({ TableName: tableName }),
);

const table = result.Table;
if (!table) {
  throw new Error(`DescribeTable returned no Table for ${tableName}`);
}

const deployed = tableIndexesFromDescribeTable({
  GlobalSecondaryIndexes: table.GlobalSecondaryIndexes,
  AttributeDefinitions: table.AttributeDefinitions,
});

console.log(
  `Deployed GSIs on ${tableName}: ${deployed.map((g) => g.indexName).join(', ') || '(none)'}`,
);
console.log(
  `APP_TABLE GSIs: ${APP_TABLE.globalSecondaryIndexes.map((g) => g.indexName).join(', ')}`,
);

assertAppTableGsiUpdateSafe(deployed);
console.log(
  'GSI update vs deployed table is safe (at most one create/delete).',
);
