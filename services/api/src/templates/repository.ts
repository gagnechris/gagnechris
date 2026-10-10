import {
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  buildDailyTemplateItem,
  dailyTemplateFromItem,
  isOptimisticLockConflict,
  keys,
  parseDailyTemplateItem,
} from '@gagnechris/data';
import {
  defaultDailyTemplate,
  type DailyTemplate,
  type NotebookArea,
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';
import { systemClock, type Clock } from '../data/clock.js';
import { throwVersionConflict } from '../data/version-condition.js';

/**
 * One row per user and area; no row is the built-in template at version 0.
 * A reset writes a row marked default rather than deleting, so a device
 * holding an older version still gets a conflict instead of a silent reset.
 */
export class DailyTemplatesRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
    private readonly nowIso: Clock = systemClock,
  ) {}

  private async stored(userId: string, area: NotebookArea) {
    const { Item } = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: keys.notebook.dailyTemplate(userId, area),
        ConsistentRead: true,
      }),
    );
    return Item ? parseDailyTemplateItem(Item) : undefined;
  }

  async get(userId: string, area: NotebookArea): Promise<DailyTemplate> {
    const item = await this.stored(userId, area);
    return item ? dailyTemplateFromItem(item) : defaultDailyTemplate(area);
  }

  update(
    userId: string,
    area: NotebookArea,
    bodyMarkdown: string,
    expected: number | 'any',
  ): Promise<DailyTemplate> {
    return this.write(
      userId,
      area,
      { bodyMarkdown, isDefault: false },
      expected,
    );
  }

  reset(
    userId: string,
    area: NotebookArea,
    expected: number | 'any',
  ): Promise<DailyTemplate> {
    return this.write(
      userId,
      area,
      { bodyMarkdown: '', isDefault: true },
      expected,
    );
  }

  private async write(
    userId: string,
    area: NotebookArea,
    content: { bodyMarkdown: string; isDefault: boolean },
    expected: number | 'any',
  ): Promise<DailyTemplate> {
    const existing = await this.stored(userId, area);
    const base = expected === 'any' ? (existing?.version ?? 0) : expected;
    if ((existing?.version ?? 0) !== base) {
      return this.conflict(userId, area, base);
    }
    if (!existing && content.isDefault) return defaultDailyTemplate(area);
    const now = this.nowIso();
    const item = buildDailyTemplateItem(userId, {
      area,
      ...content,
      version: base + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ...(base === 0
            ? { ConditionExpression: 'attribute_not_exists(pk)' }
            : {
                ConditionExpression: 'attribute_exists(pk) AND version = :v',
                ExpressionAttributeValues: { ':v': base },
              }),
        }),
      );
    } catch (error) {
      if (isOptimisticLockConflict(error)) {
        return this.conflict(userId, area, base);
      }
      throw error;
    }
    return dailyTemplateFromItem(item);
  }

  private conflict(
    userId: string,
    area: NotebookArea,
    expected: number,
  ): Promise<never> {
    return throwVersionConflict(expected, () => this.get(userId, area));
  }
}

export const dailyTemplatesRepository = () => new DailyTemplatesRepository();
