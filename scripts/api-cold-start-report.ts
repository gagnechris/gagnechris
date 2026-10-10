/**
 * Cold-start report for the prod API Lambda: REPORT lines joined to the
 * handler's `request` log line by Lambda request id, per memory size.
 *
 *   AWS_PROFILE=gagnechris-readonly npx tsx scripts/api-cold-start-report.ts
 *   ... --days 14 | --since 2026-10-07T00:00:00Z | --file results.json
 *   ... --function gagnechris-prod-api-go   (default gagnechris-prod-api)
 *
 * `--file` reads saved `aws logs get-query-results` output instead of querying.
 * The query only reads route, durations and memory; no request content.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const API_COLD_START_QUERY = `filter @type = "REPORT" or message = "request"
| fields coalesce(@requestId, function_request_id) as invocation
| stats earliest(route) as apiRoute, max(@initDuration) as initMs, max(@duration) as durationMs, max(@memorySize / 1000 / 1000) as memoryMb, max(bundleReadyMs) as loadMs, count(*) as lineCount by invocation
| filter lineCount = 2`;

const QUERY_ROW_LIMIT = 10_000;
// Every other route reads or writes the data table.
const NON_DYNAMODB_ROUTES = [
  /^GET \/api\/health$/,
  /^GET \/api\/admin\/me$/,
  /^\w+ \/api\/admin\/media\//,
];

export type QueryResults = { field: string; value: string }[][];

export interface Invocation {
  route: string;
  memoryMb: number;
  durationMs: number;
  initMs?: number;
  bundleReadyMs?: number;
}

export function normalizeRoute(route: string): string {
  return route
    .replace(/(\/api\/admin\/media\/objects)\/.+$/, '$1/:key+')
    .split('/')
    .map((segment) =>
      /^(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-f]{8}-[0-9a-f-]{27}|\d{4}-\d{2}-\d{2}|\d+)$/i.test(
        segment,
      )
        ? ':id'
        : segment,
    )
    .join('/');
}

export function isDynamoRoute(route: string): boolean {
  return !NON_DYNAMODB_ROUTES.some((re) => re.test(route));
}

export function parseQueryResults(results: QueryResults): Invocation[] {
  return results.flatMap((row) => {
    const f = Object.fromEntries(row.map((c) => [c.field, c.value]));
    if (!f.apiRoute || !f.durationMs) return [];
    const num = (v: string | undefined) => (v ? Number(v) : undefined);
    return [
      {
        route: normalizeRoute(f.apiRoute),
        memoryMb: Math.round(Number(f.memoryMb)),
        durationMs: Number(f.durationMs),
        initMs: num(f.initMs),
        bundleReadyMs: num(f.loadMs),
      },
    ];
  });
}

/** Nearest-rank percentile; undefined for no samples. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

export interface Stats {
  invocations: number;
  cold: number;
  coldRatio: number;
  initP50?: number;
  initP95?: number;
  bundleReadyP50?: number;
  coldHandlerP50?: number;
  coldHandlerP95?: number;
  coldTotalP50?: number;
  warmP50?: number;
  warmP95?: number;
}

export function stats(rows: Invocation[]): Stats {
  const cold = rows.filter((r) => r.initMs !== undefined);
  const warm = rows.filter((r) => r.initMs === undefined);
  const coldMs = cold.map((r) => r.durationMs);
  return {
    invocations: rows.length,
    cold: cold.length,
    coldRatio: rows.length ? cold.length / rows.length : 0,
    initP50: percentile(
      cold.map((r) => r.initMs!),
      50,
    ),
    initP95: percentile(
      cold.map((r) => r.initMs!),
      95,
    ),
    bundleReadyP50: percentile(
      cold.flatMap((r) =>
        r.bundleReadyMs === undefined ? [] : [r.bundleReadyMs],
      ),
      50,
    ),
    coldHandlerP50: percentile(coldMs, 50),
    coldHandlerP95: percentile(coldMs, 95),
    coldTotalP50: percentile(
      cold.map((r) => r.initMs! + r.durationMs),
      50,
    ),
    warmP50: percentile(
      warm.map((r) => r.durationMs),
      50,
    ),
    warmP95: percentile(
      warm.map((r) => r.durationMs),
      95,
    ),
  };
}

const ms = (v: number | undefined) =>
  v === undefined ? '-' : `${Math.round(v)}`;

function statsLine(label: string, s: Stats): string {
  return [
    `${label}: ${s.invocations} invocations, ${s.cold} cold (${(s.coldRatio * 100).toFixed(0)}%)`,
    `  init p50/p95 ${ms(s.initP50)}/${ms(s.initP95)} ms, bundle ready p50 ${ms(s.bundleReadyP50)} ms`,
    `  cold handler p50/p95 ${ms(s.coldHandlerP50)}/${ms(s.coldHandlerP95)} ms, cold total p50 ${ms(s.coldTotalP50)} ms`,
    `  warm handler p50/p95 ${ms(s.warmP50)}/${ms(s.warmP95)} ms`,
  ].join('\n');
}

export function formatReport(rows: Invocation[]): string {
  const out: string[] = [];
  const memorySizes = [...new Set(rows.map((r) => r.memoryMb))].sort(
    (a, b) => a - b,
  );
  for (const mb of memorySizes) {
    const atSize = rows.filter((r) => r.memoryMb === mb);
    out.push(`== ${mb} MB ==`);
    out.push(statsLine('All routes', stats(atSize)));
    out.push(
      statsLine(
        'DynamoDB routes',
        stats(atSize.filter((r) => isDynamoRoute(r.route))),
      ),
    );
    out.push(
      '',
      'route | n | cold | warm p50 | warm p95 | cold handler p50 | cold handler p95',
    );
    const byRoute = new Map<string, Invocation[]>();
    for (const r of atSize)
      byRoute.set(r.route, [...(byRoute.get(r.route) ?? []), r]);
    for (const [route, list] of [...byRoute].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      const s = stats(list);
      out.push(
        `${route} | ${s.invocations} | ${s.cold} | ${ms(s.warmP50)} | ${ms(s.warmP95)} | ${ms(s.coldHandlerP50)} | ${ms(s.coldHandlerP95)}`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

function aws(args: string[]): string {
  return execFileSync('aws', [...args, '--output', 'json'], {
    encoding: 'utf8',
  });
}

async function runQuery(
  functionName: string,
  start: number,
  end: number,
): Promise<QueryResults> {
  const logGroup = JSON.parse(
    aws([
      'lambda',
      'get-function-configuration',
      '--function-name',
      functionName,
      '--query',
      'LoggingConfig.LogGroup',
    ]),
  ) as string;
  const { queryId } = JSON.parse(
    aws([
      'logs',
      'start-query',
      '--log-group-name',
      logGroup,
      '--start-time',
      String(start),
      '--end-time',
      String(end),
      '--limit',
      String(QUERY_ROW_LIMIT),
      '--query-string',
      API_COLD_START_QUERY,
    ]),
  ) as { queryId: string };
  for (;;) {
    const res = JSON.parse(
      aws(['logs', 'get-query-results', '--query-id', queryId]),
    ) as {
      status: string;
      results: QueryResults;
    };
    if (res.status === 'Complete') return res.results;
    if (res.status !== 'Running' && res.status !== 'Scheduled') {
      throw new Error(`Logs Insights query ${res.status}`);
    }
    await sleep(2000);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: {
      days: { type: 'string', default: '14' },
      since: { type: 'string' },
      file: { type: 'string' },
      function: { type: 'string', default: 'gagnechris-prod-api' },
    },
  });
  const end = Math.floor(Date.now() / 1000);
  const start = values.since
    ? Math.floor(Date.parse(values.since) / 1000)
    : end - Number(values.days) * 86_400;
  const results = values.file
    ? (
        JSON.parse(readFileSync(values.file, 'utf8')) as {
          results: QueryResults;
        }
      ).results
    : await runQuery(values.function, start, end);
  if (results.length >= QUERY_ROW_LIMIT) {
    console.warn(`Hit the ${QUERY_ROW_LIMIT}-row limit; narrow the window.`);
  }
  if (!values.file) {
    console.log(
      `${new Date(start * 1000).toISOString()} to ${new Date(end * 1000).toISOString()}`,
    );
  }
  console.log(formatReport(parseQueryResults(results)));
}
