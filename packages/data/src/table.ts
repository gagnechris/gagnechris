/** Add GSIs / key attributes here only: CDK and the local bootstrap both read this module. */

import { GSI1_NAME, GSI2_NAME, GSI3_NAME } from './keys.js';

export type DynamoAttributeTypeCode = 'S' | 'N' | 'B';

export type DynamoProjectionType = 'ALL' | 'KEYS_ONLY' | 'INCLUDE';

export interface TableKeyAttribute {
  readonly name: string;
  readonly type: DynamoAttributeTypeCode;
}

export interface TableIndexDefinition {
  readonly indexName: string;
  readonly partitionKey: TableKeyAttribute;
  readonly sortKey: TableKeyAttribute;
  readonly projectionType: DynamoProjectionType;
  /** Required (non-empty) for `INCLUDE`; must be omitted for `ALL` / `KEYS_ONLY`. */
  readonly nonKeyAttributes?: readonly string[];
}

export interface AppTableDefinition {
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
 * Independent of `APP_TABLE` so a PR can add one GSI without bumping the
 * baseline in the same change. Bump it after a successful single-GSI deploy
 * (see `infra/RUNBOOK.md`).
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

/** Shared by CDK and the local bootstrap so projections cannot diverge between local and prod. */
export function gsiProjection(gsi: TableIndexDefinition): {
  ProjectionType: DynamoProjectionType;
  NonKeyAttributes?: string[];
} {
  const attrs = gsi.nonKeyAttributes;
  if (gsi.projectionType === 'INCLUDE') {
    if (!attrs || attrs.length === 0) {
      throw new Error(
        `GSI ${gsi.indexName} uses INCLUDE projection but lists no nonKeyAttributes`,
      );
    }
    return { ProjectionType: 'INCLUDE', NonKeyAttributes: [...attrs] };
  }
  if (attrs !== undefined) {
    throw new Error(
      `GSI ${gsi.indexName} lists nonKeyAttributes but uses ${gsi.projectionType} projection (only INCLUDE takes them)`,
    );
  }
  return { ProjectionType: gsi.projectionType };
}

function sortedNonKeyAttributes(gsi: TableIndexDefinition): string {
  return [...(gsi.nonKeyAttributes ?? [])].sort().join('\u0000');
}

function keyAttrEqual(a: TableKeyAttribute, b: TableKeyAttribute): boolean {
  return a.name === b.name && a.type === b.type;
}

function gsiDefinitionEqual(
  a: TableIndexDefinition,
  b: TableIndexDefinition,
): boolean {
  return (
    keyAttrEqual(a.partitionKey, b.partitionKey) &&
    keyAttrEqual(a.sortKey, b.sortKey) &&
    a.projectionType === b.projectionType &&
    sortedNonKeyAttributes(a) === sortedNonKeyAttributes(b)
  );
}

/**
 * CloudFormation rejects updates that create or delete more than one GSI in
 * one deploy; changing an existing index's keys or projection counts as two.
 */
export function assertSafeGsiUpdate(
  previous: readonly TableIndexDefinition[],
  next: readonly TableIndexDefinition[],
): void {
  const prevByName = new Map(previous.map((g) => [g.indexName, g]));
  const nextByName = new Map(next.map((g) => [g.indexName, g]));

  const added: string[] = [];
  const removed: string[] = [];
  const redefined: string[] = [];

  for (const [name, nextGsi] of nextByName) {
    const prevGsi = prevByName.get(name);
    if (!prevGsi) {
      added.push(name);
      continue;
    }
    if (!gsiDefinitionEqual(prevGsi, nextGsi)) {
      redefined.push(name);
    }
  }
  for (const name of prevByName.keys()) {
    if (!nextByName.has(name)) {
      removed.push(name);
    }
  }

  const changeCount = added.length + removed.length + redefined.length * 2;

  if (changeCount > 1) {
    const parts: string[] = [];
    if (added.length || removed.length) {
      parts.push(
        `adds [${added.join(', ') || 'none'}] and removes [${removed.join(', ') || 'none'}]`,
      );
    }
    if (redefined.length) {
      parts.push(
        `changes key schema or projection on [${redefined.join(', ')}] (counts as delete+create)`,
      );
    }
    throw new Error(
      `CloudFormation allows at most one GSI create or delete per table update; ` +
        `this change ${parts.join('; ')}. ` +
        `Split into separate deploys (see infra/RUNBOOK.md).`,
    );
  }
}

export function assertAppTableGsiUpdateSafe(
  previous: readonly TableIndexDefinition[],
): void {
  assertSafeGsiUpdate(previous, APP_TABLE.globalSecondaryIndexes);
}

type DescribeKeySchemaElement = {
  AttributeName?: string;
  KeyType?: string;
};

type DescribeAttributeDefinition = {
  AttributeName?: string;
  AttributeType?: string;
};

type DescribeGlobalSecondaryIndex = {
  IndexName?: string;
  KeySchema?: DescribeKeySchemaElement[];
  Projection?: { ProjectionType?: string; NonKeyAttributes?: string[] };
};

export function tableIndexesFromDescribeTable(input: {
  GlobalSecondaryIndexes?: DescribeGlobalSecondaryIndex[];
  AttributeDefinitions?: DescribeAttributeDefinition[];
}): TableIndexDefinition[] {
  const attrTypes = new Map<string, DynamoAttributeTypeCode>();
  for (const def of input.AttributeDefinitions ?? []) {
    const name = def.AttributeName;
    const type = def.AttributeType;
    if (!name || (type !== 'S' && type !== 'N' && type !== 'B')) continue;
    attrTypes.set(name, type);
  }

  const indexes: TableIndexDefinition[] = [];
  for (const gsi of input.GlobalSecondaryIndexes ?? []) {
    const indexName = gsi.IndexName;
    if (!indexName) {
      throw new Error('DescribeTable GSI missing IndexName');
    }
    const hash = gsi.KeySchema?.find((k) => k.KeyType === 'HASH');
    const range = gsi.KeySchema?.find((k) => k.KeyType === 'RANGE');
    const pkName = hash?.AttributeName;
    const skName = range?.AttributeName;
    if (!pkName || !skName) {
      throw new Error(`DescribeTable GSI ${indexName} missing HASH/RANGE keys`);
    }
    const pkType = attrTypes.get(pkName);
    const skType = attrTypes.get(skName);
    if (!pkType || !skType) {
      throw new Error(
        `DescribeTable GSI ${indexName} key attributes missing from AttributeDefinitions`,
      );
    }
    const projection = gsi.Projection?.ProjectionType;
    if (
      projection !== 'ALL' &&
      projection !== 'KEYS_ONLY' &&
      projection !== 'INCLUDE'
    ) {
      throw new Error(
        `DescribeTable GSI ${indexName} has unsupported ProjectionType ${String(projection)}`,
      );
    }
    const nonKeyAttributes = gsi.Projection?.NonKeyAttributes;
    indexes.push({
      indexName,
      partitionKey: { name: pkName, type: pkType },
      sortKey: { name: skName, type: skType },
      projectionType: projection,
      ...(projection === 'INCLUDE' && nonKeyAttributes?.length
        ? { nonKeyAttributes: [...nonKeyAttributes] }
        : {}),
    });
  }
  return indexes;
}
