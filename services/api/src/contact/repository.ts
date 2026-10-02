import {
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import {
  contactMsgSk,
  contactPk,
  type ContactEmailStatus,
  type ContactMsgItem,
} from '@gagnechris/data';

export type SaveContactInput = {
  name: string;
  email: string;
  message: string;
  sourceIp: string;
};

export class ContactRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  /** Persist a contact message before attempting SES (CHR-98). */
  async save(input: SaveContactInput): Promise<ContactMsgItem> {
    const contactId = ulid();
    const createdAt = new Date().toISOString();
    const item: ContactMsgItem = {
      pk: contactPk(contactId),
      sk: contactMsgSk(),
      entityType: 'contact',
      contactId,
      name: input.name,
      email: input.email,
      message: input.message,
      sourceIp: input.sourceIp,
      createdAt,
      emailStatus: 'pending',
    };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return item;
  }

  async updateEmailStatus(
    contactId: string,
    emailStatus: ContactEmailStatus,
    emailError?: string,
  ): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: contactPk(contactId), sk: contactMsgSk() },
        UpdateExpression: emailError
          ? 'SET emailStatus = :status, emailError = :err'
          : 'SET emailStatus = :status REMOVE emailError',
        ExpressionAttributeValues: emailError
          ? { ':status': emailStatus, ':err': emailError.slice(0, 500) }
          : { ':status': emailStatus },
      }),
    );
  }
}
