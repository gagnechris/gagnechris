/** Test-only Dynamo helpers for posts (CHR-129 — kept out of production module). */
import {
  DeleteCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Post } from '@gagnechris/shared';
import { buildMetaItem, postMetaSk, postPk } from '@gagnechris/data';

export async function putMetaForTests(
  doc: DynamoDBDocumentClient,
  tableName: string,
  post: Post,
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: buildMetaItem(post),
    }),
  );
}

export async function deleteMetaForTests(
  doc: DynamoDBDocumentClient,
  tableName: string,
  postId: string,
): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { pk: postPk(postId), sk: postMetaSk() },
    }),
  );
}
