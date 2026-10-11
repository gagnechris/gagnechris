import { beforeEach, describe, expect, it } from 'vitest';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import {
  cleanupTagRows,
  tagRowCleanupExitCode,
  type TagRowCleanupMode,
} from '@gagnechris/ops/tag-row-cleanup';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('tag-row-cleanup');
const { ok, row } = siteAdminClient(h);

const tagRow = (tag: string, publishedAt: string, postId: string) => {
  const pk = `TAG#${tag}`;
  const sk = `TS#${publishedAt}#POST#${postId}`;
  return {
    pk,
    sk,
    gsi2pk: pk,
    gsi2sk: sk,
    entityType: 'tagIndex',
    postId,
    slug: 'a-post',
  };
};

describe('tag row cleanup (DynamoDB Local)', () => {
  let postId: string;

  beforeEach(async () => {
    const post = await ok('POST', '/api/admin/posts', {
      body: { title: 'A post', tags: ['one', 'two'] },
    });
    const published = await ok('POST', `/api/admin/posts/${post.id}/publish`, {
      body: { version: post.version },
    });
    postId = post.id;
    for (const tag of ['one', 'two']) {
      await h.doc.send(
        new PutCommand({
          TableName: h.tableName,
          Item: tagRow(tag, published.publishedAt, post.id),
        }),
      );
    }
  });

  const run = (mode: TagRowCleanupMode) =>
    cleanupTagRows({ doc: h.doc, tableName: h.tableName, mode });

  const pks = async () =>
    (
      (await h.doc.send(new ScanCommand({ TableName: h.tableName }))).Items ??
      []
    )
      .map((item) => String(item.pk))
      .sort();

  it('dry run and verify count tag rows and delete nothing', async () => {
    const before = await pks();
    const dry = await run('dry-run');
    expect(dry).toEqual({
      table: h.tableName,
      mode: 'dry-run',
      scanned: before.length,
      tagRows: 2,
      deleted: 0,
    });
    expect(tagRowCleanupExitCode(dry)).toBe(0);
    const verify = await run('verify');
    expect(verify.tagRows).toBe(2);
    expect(tagRowCleanupExitCode(verify)).toBe(2);
    expect(await pks()).toEqual(before);
  });

  it('apply deletes only tag rows and re-running is a no-op', async () => {
    const before = await pks();
    const applied = await run('apply');
    expect(applied).toMatchObject({ tagRows: 2, deleted: 2 });
    expect(tagRowCleanupExitCode(applied)).toBe(0);
    expect(await pks()).toEqual(before.filter((pk) => !pk.startsWith('TAG#')));
    expect(await row(keys.post.published(postId))).toMatchObject({
      tags: ['one', 'two'],
    });

    expect(await run('apply')).toMatchObject({ tagRows: 0, deleted: 0 });
    expect(tagRowCleanupExitCode(await run('verify'))).toBe(0);
  });
});
