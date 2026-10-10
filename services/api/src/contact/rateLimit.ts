import {
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { getDocClient, requireTableName } from '../data/client.js';
import {
  dynamoErrorName,
  rateContactIpPk,
  rateDaySk,
  rateHourSk,
  rateResumeIpPk,
  rateSesGlobalPk,
  ttlEndOfUtcDay,
  ttlEndOfUtcHour,
} from '@gagnechris/data';
import {
  CONTACT_PER_IP_PER_HOUR,
  SES_GLOBAL_DAILY_CAP,
} from '@gagnechris/shared';

export { CONTACT_PER_IP_PER_HOUR, SES_GLOBAL_DAILY_CAP };

export class RateLimitExceededError extends Error {
  readonly code = 'rate_limited' as const;

  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

export async function tryIncrementCounter(input: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  pk: string;
  sk: string;
  max: number;
  ttl: number;
}): Promise<boolean> {
  try {
    await input.doc.send(
      new UpdateCommand({
        TableName: input.tableName,
        Key: { pk: input.pk, sk: input.sk },
        UpdateExpression:
          'ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl), entityType = if_not_exists(entityType, :etype)',
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :max',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':one': 1,
          ':max': input.max,
          ':ttl': input.ttl,
          ':etype': 'rateLimit',
        },
      }),
    );
    return true;
  } catch (error) {
    if (dynamoErrorName(error) === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}

export class RateLimiter {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async consumeContactIp(ip: string): Promise<void> {
    const at = this.now();
    const ok = await tryIncrementCounter({
      doc: this.doc,
      tableName: this.tableName,
      pk: rateContactIpPk(ip),
      sk: rateHourSk(at),
      max: CONTACT_PER_IP_PER_HOUR,
      ttl: ttlEndOfUtcHour(at),
    });
    if (!ok) {
      throw new RateLimitExceededError(
        'Too many contact submissions from this address. Try again later.',
      );
    }
  }

  /** Call only when about to send mail (after persistence / dedupe). */
  async consumeSesSend(): Promise<void> {
    const at = this.now();
    const ok = await tryIncrementCounter({
      doc: this.doc,
      tableName: this.tableName,
      pk: rateSesGlobalPk(),
      sk: rateDaySk(at),
      max: SES_GLOBAL_DAILY_CAP,
      ttl: ttlEndOfUtcDay(at),
    });
    if (!ok) {
      throw new RateLimitExceededError(
        'Daily email quota reached. Your message was saved; try again tomorrow.',
      );
    }
  }

  async claimResumeNotifyIp(ip: string): Promise<boolean> {
    const at = this.now();
    return tryIncrementCounter({
      doc: this.doc,
      tableName: this.tableName,
      pk: rateResumeIpPk(ip),
      sk: rateDaySk(at),
      max: 1,
      ttl: ttlEndOfUtcDay(at),
    });
  }
}
