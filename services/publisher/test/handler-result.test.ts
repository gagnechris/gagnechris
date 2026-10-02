import { describe, expect, it, vi } from 'vitest';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  handlerSuccessFromRebuild,
  recordPublishMetrics,
} from '../src/handler-result.js';
import type { RebuildResult } from '../src/rebuild-result.js';

function baseResult(
  overrides: Partial<RebuildResult> = {},
): RebuildResult {
  return {
    publishedCount: 1,
    removedSlugs: [],
    resumePublished: false,
    resumeUnpublished: false,
    resumePdfFailed: false,
    homePublished: false,
    homeRestoredFromSnapshot: false,
    invalidated: ['/resume*'],
    ...overrides,
  };
}

describe('recordPublishMetrics (CHR-179)', () => {
  it('emits ResumePdfError when resumePdfFailed is true', () => {
    const addMetric = vi.fn();
    const metrics = {
      addMetric,
      publishStoredMetrics: vi.fn(),
    };

    recordPublishMetrics(
      metrics as never,
      baseResult({ resumePdfFailed: true }),
    );

    expect(addMetric).toHaveBeenCalledWith(
      'ResumePdfError',
      MetricUnit.Count,
      1,
    );
  });

  it('does not emit ResumePdfError when PDF succeeded', () => {
    const addMetric = vi.fn();
    const metrics = {
      addMetric,
      publishStoredMetrics: vi.fn(),
    };

    recordPublishMetrics(
      metrics as never,
      baseResult({ resumePdfFailed: false }),
    );

    expect(addMetric).not.toHaveBeenCalledWith(
      'ResumePdfError',
      MetricUnit.Count,
      1,
    );
  });

  it('handlerSuccessFromRebuild publishes ResumePdfError before returning', () => {
    const addMetric = vi.fn();
    const publishStoredMetrics = vi.fn();
    const logger = { info: vi.fn() };

    const body = handlerSuccessFromRebuild(
      logger as never,
      { addMetric, publishStoredMetrics } as never,
      baseResult({ resumePdfFailed: true, publishedCount: 0 }),
    );

    expect(body).toEqual({
      ok: true,
      publishedCount: 0,
      removedSlugs: [],
    });
    expect(addMetric).toHaveBeenCalledWith(
      'ResumePdfError',
      MetricUnit.Count,
      1,
    );
    expect(publishStoredMetrics).toHaveBeenCalled();
  });
});
