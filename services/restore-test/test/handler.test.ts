import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handler,
  setRestoreTestDepsForTests,
  type PutValidationFn,
  type RestoreJobStateChangeEvent,
  type RestoreTestDeps,
} from '../src/handler.js';
import { metrics } from '../src/observability.js';
import { healthyItems, pagedScan } from './fixtures.js';

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
    putValidation: put,
    listTables: async () => ({ TableNames: [] }),
    describeCreation: async () => undefined,
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

describe('restore-test handler (CHR-198)', () => {
  it('reports SUCCESSFUL for a healthy restore', async () => {
    const { put } = fakeDeps();
    const addMetric = vi.spyOn(metrics, 'addMetric');
    const out = await handler(completed());
    expect(out).toMatchObject({
      kind: 'validation',
      tableName: 'awsbackup-restore-test-abc',
    });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ restoreJobId: 'job-1', status: 'SUCCESSFUL' }),
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
    expect(out).toEqual({
      kind: 'leftoverCheck',
      leftovers: [{ tableName: 'gagnechris-prod-restore-x', ageHours: 60 }],
    });
    expect(addMetric).toHaveBeenCalledWith(
      'LeftoverRestoreTables',
      expect.anything(),
      1,
    );
  });

  it('rejects unknown events', async () => {
    fakeDeps();
    await expect(
      handler({ action: 'nope' } as unknown as Parameters<typeof handler>[0]),
    ).rejects.toThrow('Unsupported');
  });
});
