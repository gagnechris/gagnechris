import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { APP_TABLE, tableIndexesFromDescribeTable } from '@gagnechris/data';
import {
  createEphemeralIntegrationTable,
  createLocalDynamoClient,
  deleteIntegrationTable,
  INTEGRATION_TABLE_PREFIX,
  localDynamoEndpoint,
} from '../support/dynamo-local.js';

const repoRoot = path.resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
);

const created: string[] = [];
afterAll(async () => {
  for (const name of created) await deleteIntegrationTable(name);
});

async function describeTable(tableName: string) {
  const { Table } = await createLocalDynamoClient().send(
    new DescribeTableCommand({ TableName: tableName }),
  );
  return {
    indexes: tableIndexesFromDescribeTable(Table!).sort((a, b) =>
      a.indexName.localeCompare(b.indexName),
    ),
    stream: Table!.StreamSpecification?.StreamViewType,
  };
}

describe('DynamoDB Local tables', () => {
  it('match APP_TABLE whether the HTTP suite or the local bootstrap creates them', async () => {
    const suiteTable = await createEphemeralIntegrationTable('table-schema');
    created.push(suiteTable);

    const bootstrapTable = `${INTEGRATION_TABLE_PREFIX}bootstrap-${randomBytes(4).toString('hex')}`;
    created.push(bootstrapTable);
    execFileSync(
      path.join(repoRoot, 'node_modules', '.bin', 'tsx'),
      ['scripts/local/bootstrap-table.ts'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATA_TABLE_NAME: bootstrapTable,
          AWS_ENDPOINT_URL_DYNAMODB: localDynamoEndpoint,
        },
        stdio: 'pipe',
      },
    );

    const expected = {
      indexes: [...APP_TABLE.globalSecondaryIndexes].sort((a, b) =>
        a.indexName.localeCompare(b.indexName),
      ),
      stream: APP_TABLE.streamViewType,
    };
    expect(await describeTable(suiteTable)).toEqual(expected);
    expect(await describeTable(bootstrapTable)).toEqual(expected);
  });
});
