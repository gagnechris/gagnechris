import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_COLD_START_QUERY,
  formatReport,
  isDynamoRoute,
  normalizeRoute,
  parseQueryResults,
  stats,
  type QueryResults,
} from '../../scripts/api-cold-start-report.js';
import { REPO_ROOT } from '../lib/constructs/node-lambda.js';

function row(fields: Record<string, string>): QueryResults[number] {
  return Object.entries({ invocation: 'req', lineCount: '2', ...fields }).map(
    ([field, value]) => ({ field, value }),
  );
}

describe('API cold-start report', () => {
  it('queries the log keys the handler writes', () => {
    const handler = readFileSync(
      join(REPO_ROOT, 'services/api/src/handler.ts'),
      'utf8',
    );
    expect(handler).toContain("logger.info('request'");
    expect(handler).toContain('route:');
    expect(handler).toContain('bundleReadyMs');
    expect(API_COLD_START_QUERY).toContain('message = "request"');
    expect(API_COLD_START_QUERY).toContain('earliest(route)');
    expect(API_COLD_START_QUERY).toContain('max(bundleReadyMs)');
  });

  it('folds ids, dates and media keys into route templates', () => {
    expect(
      normalizeRoute('PUT /api/notebook/notes/daily/work/2026-10-06'),
    ).toBe('PUT /api/notebook/notes/daily/work/:id');
    expect(
      normalizeRoute('GET /api/admin/posts/01ARZ3NDEKTSV4RRFFQ48JMSC9'),
    ).toBe('GET /api/admin/posts/:id');
    expect(
      normalizeRoute('DELETE /api/admin/media/objects/media/a/b.png'),
    ).toBe('DELETE /api/admin/media/objects/:key+');
    expect(normalizeRoute('GET /api/notebook/tasks')).toBe(
      'GET /api/notebook/tasks',
    );
  });

  it('treats every route but health, me and media as DynamoDB-backed', () => {
    expect(isDynamoRoute('GET /api/health')).toBe(false);
    expect(isDynamoRoute('GET /api/admin/me')).toBe(false);
    expect(isDynamoRoute('POST /api/admin/media/upload-url')).toBe(false);
    expect(isDynamoRoute('GET /api/admin/posts')).toBe(true);
    expect(isDynamoRoute('POST /api/contact')).toBe(true);
  });

  it('splits cold from warm and reports init and handler percentiles', () => {
    const rows = parseQueryResults([
      row({
        apiRoute: 'GET /api/admin/posts',
        durationMs: '230',
        initMs: '440',
        memoryMb: '1024',
        loadMs: '120',
      }),
      row({
        apiRoute: 'GET /api/admin/posts',
        durationMs: '60',
        memoryMb: '1024',
      }),
      row({
        apiRoute: 'GET /api/admin/posts',
        durationMs: '80',
        memoryMb: '1024',
      }),
      row({
        apiRoute: 'GET /api/health',
        durationMs: '14',
        initMs: '450',
        memoryMb: '1024',
      }),
      row({ durationMs: '5', memoryMb: '1024' }),
    ]);
    expect(rows).toHaveLength(4);

    const db = stats(rows.filter((r) => isDynamoRoute(r.route)));
    expect(db).toMatchObject({
      invocations: 3,
      cold: 1,
      initP50: 440,
      bundleReadyP50: 120,
      coldHandlerP50: 230,
      coldTotalP50: 670,
      warmP50: 60,
      warmP95: 80,
    });
    expect(db.coldRatio).toBeCloseTo(1 / 3);
    expect(stats(rows).cold).toBe(2);
  });

  it('reports each memory size separately', () => {
    const report = formatReport(
      parseQueryResults([
        row({
          apiRoute: 'GET /api/admin/posts',
          durationMs: '900',
          initMs: '555',
          memoryMb: '256',
        }),
        row({
          apiRoute: 'GET /api/admin/posts',
          durationMs: '230',
          initMs: '436',
          memoryMb: '1024',
        }),
      ]),
    );
    expect(report).toContain('== 256 MB ==');
    expect(report).toContain('== 1024 MB ==');
    expect(report.indexOf('== 256 MB ==')).toBeLessThan(
      report.indexOf('== 1024 MB =='),
    );
  });
});
