import fs from 'node:fs';
import path from 'node:path';
import type { IndexHtmlTransformHook } from 'vite';
import { describe, expect, it } from 'vitest';
import { applySpaShellMeta } from '../../scripts/staticPageMeta';
import { devSpaShellPlugin } from '../../scripts/staticPagesPlugin';

// The real shell, so a change to the GA snippet can't silently slip past
// removeAnalytics (CHR-194).
const indexHtml = fs.readFileSync(
  path.resolve(__dirname, '../../index.html'),
  'utf8',
);
const GA = /googletagmanager|google-analytics|gtag\(/;

const transform = (url: string) => {
  const hook = devSpaShellPlugin().transformIndexHtml as IndexHtmlTransformHook;
  return hook.call(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
    indexHtml,
    { path: url.split('?')[0]!, filename: 'index.html', originalUrl: url },
  );
};

describe('analytics stay off private shells (CHR-194)', () => {
  it('index.html loads GA for public pages', () => {
    expect(indexHtml).toMatch(GA);
  });

  it('spa.html built from index.html has no GA', () => {
    expect(applySpaShellMeta(indexHtml)).not.toMatch(GA);
  });

  it('dev server strips GA on /admin and /auth only', () => {
    expect(transform('/admin/notebook/today?date=2026-10-03')).not.toMatch(GA);
    expect(transform('/auth/callback?code=x')).not.toMatch(GA);
    expect(transform('/posts/hello')).toMatch(GA);
  });
});
