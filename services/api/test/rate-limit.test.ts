import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  CONTACT_PER_IP_PER_HOUR,
  RateLimitExceededError,
  RateLimiter,
  SES_GLOBAL_DAILY_CAP,
  tryIncrementCounter,
} from '../src/contact/rateLimit.js';
import {
  rateContactIpPk,
  rateDaySk,
  rateHourSk,
  rateResumeIpPk,
  rateSesGlobalPk,
} from '../src/contact/keys.js';
import { mockDocClient } from './support/mock-doc.js';

describe('tryIncrementCounter', () => {
  it('returns true when Update succeeds', async () => {
    const doc = mockDocClient(async () => ({}));
    const ok = await tryIncrementCounter({
      doc,
      tableName: 't',
      pk: 'RATE#x',
      sk: 'HOUR#2026-09-27T14',
      max: 3,
      ttl: 1_000_000,
    });
    expect(ok).toBe(true);
    const cmd = (doc.send as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      input: {
        ConditionExpression: string;
        ExpressionAttributeValues: { ':max': number };
      };
    };
    expect(cmd.input.ConditionExpression).toContain('#count < :max');
    expect(cmd.input.ExpressionAttributeValues[':max']).toBe(3);
  });

  it('returns false on ConditionalCheckFailedException', async () => {
    const doc = mockDocClient(async () => {
      throw new ConditionalCheckFailedException({
        message: 'conditional',
        $metadata: {},
      });
    });
    const ok = await tryIncrementCounter({
      doc,
      tableName: 't',
      pk: 'RATE#x',
      sk: 'HOUR#2026-09-27T14',
      max: 3,
      ttl: 1_000_000,
    });
    expect(ok).toBe(false);
  });

  it('rethrows unexpected errors', async () => {
    const doc = mockDocClient(async () => {
      throw new Error('boom');
    });
    await expect(
      tryIncrementCounter({
        doc,
        tableName: 't',
        pk: 'RATE#x',
        sk: 'HOUR#2026-09-27T14',
        max: 3,
        ttl: 1_000_000,
      }),
    ).rejects.toThrow('boom');
  });
});

describe('RateLimiter', () => {
  const fixed = new Date('2026-09-27T14:30:00.000Z');

  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  it('allows contact posts up to the hourly IP cap then rejects', async () => {
    let count = 0;
    const doc = mockDocClient(async (command) => {
      expect(command.constructor.name).toBe('UpdateCommand');
      const key = command.input.Key as { pk: string; sk: string };
      expect(key.pk).toBe(rateContactIpPk('1.2.3.4'));
      expect(key.sk).toBe(rateHourSk(fixed));
      count += 1;
      if (count > CONTACT_PER_IP_PER_HOUR) {
        throw new ConditionalCheckFailedException({
          message: 'conditional',
          $metadata: {},
        });
      }
      return {};
    });
    const limiter = new RateLimiter(doc, 'gagnechris-test', () => fixed);

    await limiter.consumeContactIp('1.2.3.4');
    await limiter.consumeContactIp('1.2.3.4');
    await limiter.consumeContactIp('1.2.3.4');
    await expect(limiter.consumeContactIp('1.2.3.4')).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(count).toBe(4);
  });

  it('enforces the global SES daily cap', async () => {
    let count = 0;
    const doc = mockDocClient(async (command) => {
      const key = command.input.Key as { pk: string; sk: string };
      expect(key.pk).toBe(rateSesGlobalPk());
      expect(key.sk).toBe(rateDaySk(fixed));
      const values = command.input.ExpressionAttributeValues as {
        ':max': number;
      };
      expect(values[':max']).toBe(SES_GLOBAL_DAILY_CAP);
      count += 1;
      if (count > SES_GLOBAL_DAILY_CAP) {
        throw new ConditionalCheckFailedException({
          message: 'conditional',
          $metadata: {},
        });
      }
      return {};
    });
    const limiter = new RateLimiter(doc, 'gagnechris-test', () => fixed);

    for (let i = 0; i < SES_GLOBAL_DAILY_CAP; i += 1) {
      await limiter.consumeSesSend();
    }
    await expect(limiter.consumeSesSend()).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
  });

  it('dedupes resume notify to one claim per IP per day', async () => {
    let count = 0;
    const doc = mockDocClient(async (command) => {
      const key = command.input.Key as { pk: string; sk: string };
      expect(key.pk).toBe(rateResumeIpPk('9.9.9.9'));
      expect(key.sk).toBe(rateDaySk(fixed));
      count += 1;
      if (count > 1) {
        throw new ConditionalCheckFailedException({
          message: 'conditional',
          $metadata: {},
        });
      }
      return {};
    });
    const limiter = new RateLimiter(doc, 'gagnechris-test', () => fixed);

    expect(await limiter.claimResumeNotifyIp('9.9.9.9')).toBe(true);
    expect(await limiter.claimResumeNotifyIp('9.9.9.9')).toBe(false);
  });
});
