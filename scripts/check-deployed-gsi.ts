/**
 * CloudFormation allows at most one GSI create/delete per update, and the
 * LAST_DEPLOYED_GSIS unit-test guard can be bumped in the same PR, so compare
 * against the live table.
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
