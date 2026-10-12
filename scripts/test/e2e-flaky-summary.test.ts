import { describe, expect, it } from 'vitest';
import {
  annotations,
  flakyTests,
  summaryMarkdown,
} from '../ci/e2e-flaky-summary.js';

const report = {
  suites: [
    {
      title: 'admin-users.spec.ts',
      file: 'admin-users.spec.ts',
      specs: [
        {
          title: 'closes on Escape',
          file: 'admin-users.spec.ts',
          line: 3,
          tests: [
            { projectName: 'chromium', status: 'expected' as const },
            { projectName: 'webkit', status: 'flaky' as const },
          ],
        },
      ],
      suites: [
        {
          title: 'on a phone',
          file: 'admin-users.spec.ts',
          specs: [
            {
              title: 'lists users',
              file: 'admin-users.spec.ts',
              line: 40,
              tests: [
                { projectName: 'webkit', status: 'unexpected' as const },
                { projectName: 'chromium', status: 'flaky' as const },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('e2e-flaky-summary', () => {
  it('lists only tests that passed on retry, with describe titles', () => {
    expect(flakyTests(report)).toEqual([
      {
        project: 'webkit',
        file: 'admin-users.spec.ts',
        line: 3,
        title: 'closes on Escape',
      },
      {
        project: 'chromium',
        file: 'admin-users.spec.ts',
        line: 40,
        title: 'on a phone › lists users',
      },
    ]);
  });

  it('writes a warning annotation and a summary row per flaky test', () => {
    const flaky = flakyTests(report);
    expect(annotations(flaky)[0]).toBe(
      '::warning file=e2e/tests/admin-users.spec.ts,line=3,title=Flaky e2e test (webkit)::closes on Escape passed only on retry',
    );
    const md = summaryMarkdown(flaky);
    expect(md).toContain('### Flaky e2e tests (2)');
    expect(md).toContain(
      '| chromium | `e2e/tests/admin-users.spec.ts:40` | on a phone › lists users |',
    );
  });

  it('writes no summary when nothing was flaky', () => {
    expect(summaryMarkdown([])).toBe('');
  });
});
