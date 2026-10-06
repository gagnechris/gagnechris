import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  RemovedUserItemSchema,
  removedUserSk,
  removedUsersPk,
  type RemovedUserItem,
} from '@gagnechris/data';
import type { AccessLevel } from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';

/**
 * Removal lives here, not in Cognito: the Cognito user stays (disabled, no
 * groups) so their `sub`, and with it their Notebook, survives a restore.
 */
export class RemovedUsersRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async list(): Promise<RemovedUserItem[]> {
    const items: RemovedUserItem[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': removedUsersPk() },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const raw of page.Items ?? []) {
        items.push(RemovedUserItemSchema.parse(raw));
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  async get(userId: string): Promise<RemovedUserItem | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: removedUsersPk(), sk: removedUserSk(userId) },
        ConsistentRead: true,
      }),
    );
    return result.Item ? RemovedUserItemSchema.parse(result.Item) : null;
  }

  async put(input: {
    userId: string;
    email: string;
    previousLevel: AccessLevel | null;
    removedBy: string;
  }): Promise<RemovedUserItem> {
    const item: RemovedUserItem = {
      pk: removedUsersPk(),
      sk: removedUserSk(input.userId),
      entityType: 'removedUser',
      userId: input.userId,
      email: input.email,
      previousLevel: input.previousLevel,
      createdAt: new Date().toISOString(),
      removedBy: input.removedBy,
    };
    await this.doc.send(
      new PutCommand({ TableName: this.tableName, Item: item }),
    );
    return item;
  }

  async delete(userId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: removedUsersPk(), sk: removedUserSk(userId) },
      }),
    );
  }
}
