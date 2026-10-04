import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handler,
  setRestoreTestDepsForTests,
  type PutValidationFn,
  type RestoreJobStateChangeEvent,
  type RestoreTestDeps,
} from '../src/handler.js';
import type { BackupFreshnessDeps } from '../src/freshness.js';
import { metrics } from '../src/observability.js';
import { fakeCount, healthyItems, noteAt, pagedScan } from './fixtures.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function healthyFreshness(
  overrides: Partial<BackupFreshnessDeps> = {},
): BackupFreshnessDeps {
  return {
    newestRecoveryPoint: async () => hoursAgo(5),
    newestSuccessfulValidation: async () => hoursAgo(3 * 24),
    restoreTestingPlanCreatedAt: async () => hoursAgo(30 * 24),
    dynamoDbAdvancedBackupEnabled: async () => true,
    ...overrides,
  };
}

const ARN =
  'arn:aws:dynamodb:us-east-1:111111111111:table/awsbackup-restore-test-abc';

function completed(
  detail: Partial<RestoreJobStateChangeEvent['detail']> = {},
): RestoreJobStateChangeEvent {
  return {
    source: 'aws.backup',
    'detail-type': 'Restore Job State Change',
    detail: {
      restoreJobId: 'job-1',
      status: 'COMPLETED',
      resourceType: 'DynamoDB',
      createdResourceArn: ARN,
      ...detail,
    },
  };
}

function fakeDeps(overrides: Partial<RestoreTestDeps> = {}) {
  const put = vi.fn<PutValidationFn>(async () => undefined);
  const deps: RestoreTestDeps = {
    scan: pagedScan(healthyItems()),
    count: fakeCount(healthyItems()),
    sourceTableName: 'gagnechris-prod',
    restorePointOf: async () => new Date('2026-10-03T07:00:00.000Z'),
    putValidation: put,
    listTables: async () => ({ TableNames: [] }),
    describeCreation: async () => undefined,
    freshness: healthyFreshness(),
    now: () => new Date('2026-10-03T12:00:00.000Z'),
    ...overrides,
  };
  setRestoreTestDepsForTests(deps);
  return { deps, put };
}

afterEach(() => {
  setRestoreTestDepsForTests(undefined);
  vi.restoreAllMocks();
});

describe('restore-test handler', () => {
  it('reports SUCCESSFUL for a healthy restore', async () => {
    const { put } = fakeDeps();
    const addMetric = vi.spyOn(metrics, 'addMetric');
    const out = await handler(completed());
    expect(out).toMatchObject({
      kind: 'validation',
      tableName: 'awsbackup-restore-test-abc',
    });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        restoreJobId: 'job-1',
        status: 'SUCCESSFUL',
        message: expect.stringContaining('counts at floor'),
      }),
    );
    expect(addMetric).toHaveBeenCalledWith(
      'RestoreValidationSucceeded',
      expect.anything(),
      1,
    );
  });

  it('reports FAILED (and emits the alarm metric) on bad content', async () => {
    const { put } = fakeDeps({ scan: pagedScan([]) });
    const addMetric = vi.spyOn(metrics, 'addMetric');
    await handler(completed());
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(addMetric).toHaveBeenCalledWith(
      'RestoreValidationFailed',
      expect.anything(),
      1,
    );
  });

  it('reports FAILED when the restore has fewer notes than the source floor', async () => {
    const source = [
      ...healthyItems(),
      noteAt('01PAGEA', '2026-10-02T00:00:00.000Z'),
      noteAt('01PAGEB', '2026-10-02T00:00:00.000Z'),
    ];
    const { put } = fakeDeps({ count: fakeCount(source) });
    await handler(completed());
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        message: expect.stringContaining('note count 1 below floor 3'),
      }),
    );
  });

  it('reports FAILED when the restore point date is unknown', async () => {
    const { put } = fakeDeps({ restorePointOf: async () => undefined });
    await handler(completed());
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        message: expect.stringContaining('count floor not checked'),
      }),
    );
  });

  it('reports FAILED when the scan throws instead of retrying', async () => {
    const denied = Object.assign(new Error('nope'), {
      name: 'AccessDeniedException',
    });
    const { put } = fakeDeps({
      scan: async () => {
        throw denied;
      },
    });
    await handler(completed());
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        message: expect.stringContaining('AccessDeniedException'),
      }),
    );
  });

  it('reports FAILED when the event names no table', async () => {
    const { put } = fakeDeps();
    await handler(completed({ createdResourceArn: undefined }));
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('ignores non-COMPLETED restore events', async () => {
    const { put } = fakeDeps();
    expect(await handler(completed({ status: 'RUNNING' }))).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  it('lets a PutRestoreValidationResult failure surface as a Lambda error', async () => {
    fakeDeps({
      putValidation: async () => {
        throw new Error('throttled');
      },
    });
    await expect(handler(completed())).rejects.toThrow('throttled');
  });

  it('counts leftover tables on the daily schedule', async () => {
    fakeDeps({
      listTables: async () => ({
        TableNames: ['gagnechris-prod', 'gagnechris-prod-restore-x'],
      }),
      describeCreation: async () => new Date('2026-10-01T00:00:00.000Z'),
    });
    const addMetric = vi.spyOn(metrics, 'addMetric');
    const out = await handler({ 'detail-type': 'Scheduled Event' });
    expect(out).toMatchObject({
      kind: 'leftoverCheck',
      leftovers: [{ tableName: 'gagnechris-prod-restore-x', ageHours: 60 }],
    });
    expect(addMetric).toHaveBeenCalledWith(
      'LeftoverRestoreTables',
      expect.anything(),
      1,
    );
  });

  describe('backup freshness on the daily schedule', () => {
    async function runDaily(freshness: BackupFreshnessDeps) {
      fakeDeps({ freshness, now: () => NOW });
      const addMetric = vi.spyOn(metrics, 'addMetric');
      const out = await handler({ action: 'leftoverCheck' });
      const value = (name: string) =>
        addMetric.mock.calls.find(([n]) => n === name)?.[2];
      return { out, value };
    }

    it('emits all-clear flags and the heartbeat when backups and tests are fresh', async () => {
      const { out, value } = await runDaily(healthyFreshness());
      expect(out).toMatchObject({
        freshness: {
          recoveryPointAgeHours: 5,
          staleRecoveryPoint: false,
          validationAgeDays: 3,
          validationMissing: false,
          advancedBackupDisabled: false,
        },
      });
      expect(value('StaleRecoveryPoint')).toBe(0);
      expect(value('RestoreValidationMissing')).toBe(0);
      expect(value('AdvancedDynamoDbBackupDisabled')).toBe(0);
      expect(value('BackupCheckCompleted')).toBe(1);
    });

    it('flags a recovery point 26 h old or with none at all', async () => {
      expect(
        (
          await runDaily(
            healthyFreshness({ newestRecoveryPoint: async () => hoursAgo(26) }),
          )
        ).value('StaleRecoveryPoint'),
      ).toBe(1);
      vi.restoreAllMocks();
      expect(
        (
          await runDaily(
            healthyFreshness({ newestRecoveryPoint: async () => undefined }),
          )
        ).value('StaleRecoveryPoint'),
      ).toBe(1);
      vi.restoreAllMocks();
      expect(
        (
          await runDaily(
            healthyFreshness({ newestRecoveryPoint: async () => hoursAgo(25) }),
          )
        ).value('StaleRecoveryPoint'),
      ).toBe(0);
    });

    it('flags no successful restore validation in 8 days (plan disabled or never matching)', async () => {
      const { value } = await runDaily(
        healthyFreshness({
          newestSuccessfulValidation: async () => hoursAgo(8 * 24 + 1),
        }),
      );
      expect(value('RestoreValidationMissing')).toBe(1);
    });

    it('flags a deleted restore testing plan', async () => {
      const { value } = await runDaily(
        healthyFreshness({
          newestSuccessfulValidation: async () => undefined,
          restoreTestingPlanCreatedAt: async () => undefined,
        }),
      );
      expect(value('RestoreValidationMissing')).toBe(1);
    });

    it('gives a new plan 8 days for its first validation', async () => {
      const { value } = await runDaily(
        healthyFreshness({
          newestSuccessfulValidation: async () => undefined,
          restoreTestingPlanCreatedAt: async () => hoursAgo(2 * 24),
        }),
      );
      expect(value('RestoreValidationMissing')).toBe(0);
    });

    it('flags DynamoDB advanced backup turned off', async () => {
      const { value } = await runDaily(
        healthyFreshness({ dynamoDbAdvancedBackupEnabled: async () => false }),
      );
      expect(value('AdvancedDynamoDbBackupDisabled')).toBe(1);
    });

    it('skips the heartbeat when a Backup API call fails', async () => {
      fakeDeps({
        freshness: healthyFreshness({
          newestRecoveryPoint: async () => {
            throw new Error('AccessDenied');
          },
        }),
      });
      const addMetric = vi.spyOn(metrics, 'addMetric');
      await expect(handler({ action: 'leftoverCheck' })).rejects.toThrow(
        'AccessDenied',
      );
      expect(addMetric).toHaveBeenCalledWith(
        'LeftoverRestoreTables',
        expect.anything(),
        0,
      );
      expect(
        addMetric.mock.calls.some(([n]) => n === 'BackupCheckCompleted'),
      ).toBe(false);
    });
  });

  it('rejects unknown events', async () => {
    fakeDeps();
    await expect(
      handler({ action: 'nope' } as unknown as Parameters<typeof handler>[0]),
    ).rejects.toThrow('Unsupported');
  });
});
