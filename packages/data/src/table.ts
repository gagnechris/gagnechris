/**
 * Single-table DynamoDB schema shared by CDK DataStack and local bootstrap.
 * Add GSIs / key attributes here only — both consumers read this module.
 */

import { GSI1_NAME, GSI2_NAME, GSI3_NAME } from './keys.js';

export type DynamoAttributeTypeCode = 'S' | 'N' | 'B';

export interface TableKeyAttribute {
  readonly name: string;
  readonly type: DynamoAttributeTypeCode;
}

export interface TableIndexDefinition {
  readonly indexName: string;
  readonly partitionKey: TableKeyAttribute;
  readonly sortKey: TableKeyAttribute;
  /** DynamoDB projection; local + CDK use ALL. */
  readonly projectionType: 'ALL';
}

export interface AppTableDefinition {
  /** Suffix after `gagnechris-` (env name). */
  readonly namePrefix: 'gagnechris';
  readonly partitionKey: TableKeyAttribute;
  readonly sortKey: TableKeyAttribute;
  readonly billingMode: 'PAY_PER_REQUEST';
  readonly streamViewType: 'NEW_AND_OLD_IMAGES';
  readonly timeToLiveAttribute: 'ttl';
  readonly globalSecondaryIndexes: readonly TableIndexDefinition[];
}

export const APP_TABLE: AppTableDefinition = {
  namePrefix: 'gagnechris',
  partitionKey: { name: 'pk', type: 'S' },
  sortKey: { name: 'sk', type: 'S' },
  billingMode: 'PAY_PER_REQUEST',
  streamViewType: 'NEW_AND_OLD_IMAGES',
  timeToLiveAttribute: 'ttl',
  globalSecondaryIndexes: [
    {
      indexName: GSI1_NAME,
      partitionKey: { name: 'gsi1pk', type: 'S' },
      sortKey: { name: 'gsi1sk', type: 'S' },
      projectionType: 'ALL',
    },
    {
      indexName: GSI2_NAME,
      partitionKey: { name: 'gsi2pk', type: 'S' },
      sortKey: { name: 'gsi2sk', type: 'S' },
      projectionType: 'ALL',
    },
    {
      indexName: GSI3_NAME,
      partitionKey: { name: 'syncPk', type: 'S' },
      sortKey: { name: 'syncSk', type: 'S' },
      projectionType: 'ALL',
    },
  ],
};

/** Attribute definitions required by the table keys + all GSIs (CreateTable). */
export function appTableAttributeDefinitions(
  def: AppTableDefinition = APP_TABLE,
): ReadonlyArray<{
  AttributeName: string;
  AttributeType: DynamoAttributeTypeCode;
}> {
  const byName = new Map<string, DynamoAttributeTypeCode>();
  const add = (attr: TableKeyAttribute) => {
    byName.set(attr.name, attr.type);
  };
  add(def.partitionKey);
  add(def.sortKey);
  for (const gsi of def.globalSecondaryIndexes) {
    add(gsi.partitionKey);
    add(gsi.sortKey);
  }
  return [...byName.entries()].map(([AttributeName, AttributeType]) => ({
    AttributeName,
    AttributeType,
  }));
}

export function appTableName(envName: string): string {
  return `${APP_TABLE.namePrefix}-${envName}`;
}

/**
 * GSI definitions last verified deployed in production (names + key schema).
 * After a successful single-GSI create/delete deploy, bump this list to match
 * APP_TABLE (see infra/RUNBOOK.md). CloudFormation allows at most one GSI
 * create or delete per table update — enforced by assertSafeGsiUpdate.
 */
export const LAST_DEPLOYED_GSIS: readonly TableIndexDefinition[] = [
  {
    indexName: 'gsi1',
    partitionKey: { name: 'gsi1pk', type: 'S' },
    sortKey: { name: 'gsi1sk', type: 'S' },
    projectionType: 'ALL',
  },
  {
    indexName: 'gsi2',
    partitionKey: { name: 'gsi2pk', type: 'S' },
    sortKey: { name: 'gsi2sk', type: 'S' },
    projectionType: 'ALL',
  },
  {
    indexName: 'gsi3',
    partitionKey: { name: 'syncPk', type: 'S' },
    sortKey: { name: 'syncSk', type: 'S' },
    projectionType: 'ALL',
  },
];

/** @deprecated Prefer LAST_DEPLOYED_GSIS; kept for call sites that only need names. */
export const LAST_DEPLOYED_GSI_NAMES = LAST_DEPLOYED_GSIS.map(
  (g) => g.indexName,
) as readonly string[];

function keyAttrEqual(a: TableKeyAttribute, b: TableKeyAttribute): boolean {
  return a.name === b.name && a.type === b.type;
}

function gsiKeySchemaEqual(
  a: TableIndexDefinition,
  b: TableIndexDefinition,
): boolean {
  return (
    keyAttrEqual(a.partitionKey, b.partitionKey) &&
    keyAttrEqual(a.sortKey, b.sortKey)
  );
}

/**
 * Guard for Notebook / schema PRs: CloudFormation rejects updates that
 * create or delete more than one GSI on the same table in one deploy.
 * Key-schema changes on an existing index count as delete + create.
 */
export function assertSafeGsiUpdate(
  previous: readonly TableIndexDefinition[],
  next: readonly TableIndexDefinition[],
): void {
  const prevByName = new Map(previous.map((g) => [g.indexName, g]));
  const nextByName = new Map(next.map((g) => [g.indexName, g]));

  const added: string[] = [];
  const removed: string[] = [];
  const keySchemaChanged: string[] = [];

  for (const [name, nextGsi] of nextByName) {
    const prevGsi = prevByName.get(name);
    if (!prevGsi) {
      added.push(name);
      continue;
    }
    if (!gsiKeySchemaEqual(prevGsi, nextGsi)) {
      keySchemaChanged.push(name);
    }
  }
  for (const name of prevByName.keys()) {
    if (!nextByName.has(name)) {
      removed.push(name);
    }
  }

  // A key-schema change requires delete + recreate (two GSI ops).
  const changeCount =
    added.length + removed.length + keySchemaChanged.length * 2;

  if (changeCount > 1) {
    const parts: string[] = [];
    if (added.length || removed.length) {
      parts.push(
        `adds [${added.join(', ') || 'none'}] and removes [${removed.join(', ') || 'none'}]`,
      );
    }
    if (keySchemaChanged.length) {
      parts.push(
        `changes key schema on [${keySchemaChanged.join(', ')}] (counts as delete+create)`,
      );
    }
    throw new Error(
      `CloudFormation allows at most one GSI create or delete per table update; ` +
        `this change ${parts.join('; ')}. ` +
        `Split into separate deploys (see infra/RUNBOOK.md).`,
    );
  }
}
