import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

interface JsonTest {
  projectName: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
}

interface JsonSpec {
  title: string;
  file: string;
  line: number;
  tests: JsonTest[];
}

interface JsonSuite {
  title: string;
  file?: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}

export interface FlakyTest {
  project: string;
  file: string;
  line: number;
  title: string;
}

export function flakyTests(report: { suites?: JsonSuite[] }): FlakyTest[] {
  const out: FlakyTest[] = [];
  const walk = (suite: JsonSuite, titles: string[]) => {
    // The top-level suite per file is titled with the file name.
    const path = suite.title === suite.file ? titles : [...titles, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        if (test.status !== 'flaky') continue;
        out.push({
          project: test.projectName,
          file: spec.file,
          line: spec.line,
          title: [...path, spec.title].join(' › '),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, path);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return out;
}

export function summaryMarkdown(flaky: FlakyTest[]): string {
  if (flaky.length === 0) return '';
  const rows = flaky.map(
    (t) => `| ${t.project} | \`e2e/tests/${t.file}:${t.line}\` | ${t.title} |`,
  );
  return [
    `### Flaky e2e tests (${flaky.length})`,
    '',
    'Passed only on retry. Fix them; the retry keeps them from failing the check, not from being broken.',
    '',
    '| Project | Test | Title |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

export function annotations(flaky: FlakyTest[]): string[] {
  return flaky.map(
    (t) =>
      `::warning file=e2e/tests/${t.file},line=${t.line},title=Flaky e2e test (${t.project})::${t.title} passed only on retry`,
  );
}

function main(reportPath: string | undefined) {
  if (!reportPath || !existsSync(reportPath)) {
    console.log(`No Playwright JSON report at ${reportPath ?? '(none)'}`);
    return;
  }
  const flaky = flakyTests(JSON.parse(readFileSync(reportPath, 'utf8')));
  for (const line of annotations(flaky)) console.log(line);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary && flaky.length > 0)
    appendFileSync(summary, summaryMarkdown(flaky));
  console.log(`${flaky.length} flaky e2e test(s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv[2]);
}
