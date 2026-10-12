// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const sourceRoots = [
  'apps/web/src',
  'apps/web/index.html',
  'packages/public-ui/src',
  'services/publisher/src',
];
const tokensCss = 'packages/tokens/src/variables.css';

const isSource = (rel: string) =>
  /\.(css|html|tsx?)$/.test(rel) && !/\.test\.tsx?$/.test(rel);

const listSources = (rel: string): string[] =>
  statSync(path.join(repoRoot, rel)).isDirectory()
    ? readdirSync(path.join(repoRoot, rel)).flatMap((name) =>
        listSources(path.join(rel, name)),
      )
    : isSource(rel)
      ? [rel]
      : [];

// An undefined custom property invalidates the whole declaration at
// computed-value time, so `padding: var(--a) var(--missing)` becomes 0.
const declared = (text: string) => [
  ...[...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!),
  // style={{ '--x': … }} and style.setProperty('--x', …)
  ...[...text.matchAll(/['"`](--[\w-]+)['"`]/g)].map((m) => m[1]!),
];
const referenced = (text: string) =>
  [...text.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].map((m) => m[1]!);

describe('CSS custom properties', () => {
  const files = sourceRoots.flatMap(listSources);
  const texts = new Map(
    [...files, tokensCss].map((rel) => [
      rel,
      readFileSync(path.join(repoRoot, rel), 'utf8'),
    ]),
  );
  const defined = new Set([...texts.values()].flatMap(declared));

  it('scans the web sources and the token sheet', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(defined).toContain('--space-4');
  });

  it('defines every var(--…) the web app, public UI and publisher use', () => {
    const undefinedRefs = files.flatMap((rel) =>
      referenced(texts.get(rel)!)
        .filter((name) => !defined.has(name))
        .map((name) => `${rel}: ${name}`),
    );
    expect(undefinedRefs).toEqual([]);
  });

  it('reads every reference in a declaration, fallbacks included', () => {
    expect(
      referenced('padding: var(--space-4) var( --gap, var(--space-2));'),
    ).toEqual(['--space-4', '--gap', '--space-2']);
  });
});
