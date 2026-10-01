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
 * GSI index names last verified deployed in production.
 * After a successful single-GSI create/delete deploy, bump this list to match
 * APP_TABLE (see infra/RUNBOOK.md). CloudFormation allows at most one GSI
 * create or delete per table update — enforced by assertSafeGsiUpdate.
 */
export const LAST_DEPLOYED_GSI_NAMES = ['gsi1', 'gsi2'] as const;

/**
 * Guard for Notebook / schema PRs: CloudFormation rejects updates that
 * create or delete more than one GSI on the same table in one deploy.
 */
export function assertSafeGsiUpdate(
  previousNames: readonly string[],
  next: readonly TableIndexDefinition[],
): void {
  const prev = new Set(previousNames);
  const nextNames = next.map((g) => g.indexName);
  const nextSet = new Set(nextNames);
  const added = nextNames.filter((n) => !prev.has(n));
  const removed = [...prev].filter((n) => !nextSet.has(n));
  const changeCount = added.length + removed.length;
  if (changeCount > 1) {
    throw new Error(
      `CloudFormation allows at most one GSI create or delete per table update; ` +
        `this change adds [${added.join(', ') || 'none'}] and removes [${removed.join(', ') || 'none'}]. ` +
        `Split into separate deploys (see infra/RUNBOOK.md).`,
    );
  }
}
