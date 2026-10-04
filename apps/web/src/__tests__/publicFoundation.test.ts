// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const src = path.join(webRoot, 'src');

/** CSS the public app can load; the signed-in apps and the bears game art are out of scope. */
const publicCss = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = path.relative(src, full);
    if (entry.isDirectory()) {
      return /^(admin|notebook|workspace|games[/\\]bears)$/.test(rel)
        ? []
        : publicCss(full);
    }
    return entry.name.endsWith('.css') ? [full] : [];
  });

describe('public CSS', () => {
  const files = publicCss(src);

  it('covers the page styles', () => {
    const names = files.map((file) => path.relative(src, file));
    expect(names).toEqual(
      expect.arrayContaining([
        'index.css',
        'public.css',
        'App.css',
        'pages/PostPage.css',
        'pages/Resume.css',
      ]),
    );
  });

  it.each(files.map((file) => [path.relative(src, file), file]))(
    '%s has no entrance animation or opacity-0 start state',
    (_name, file) => {
      const css = fs.readFileSync(file, 'utf8');
      expect(css).not.toMatch(/fadeIn|slideUp/);
      expect(css).not.toMatch(/opacity:\s*0(?:\.0+)?\s*[;}]/);
    },
  );
});

describe('public fonts', () => {
  const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(src, 'public.css'), 'utf8');
  const fontsDir = path.join(webRoot, 'public');

  it('index.html preloads only the roman Newsreader file, from this origin', () => {
    const preloads = [...html.matchAll(/<link\b[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => /rel="preload"/.test(tag) && /as="font"/.test(tag));
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toContain('href="/fonts/newsreader-roman.woff2"');
    expect(preloads[0]).toMatch(/\bcrossorigin\b/);
    expect(
      fs.existsSync(path.join(fontsDir, 'fonts/newsreader-roman.woff2')),
    ).toBe(true);
  });

  it('every @font-face is self-hosted with font-display: swap, or a local() fallback', () => {
    const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
    expect(faces.length).toBeGreaterThanOrEqual(3);
    for (const face of faces) {
      const urls = [...face.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!);
      if (urls.length === 0) {
        expect(face).toMatch(/src:\s*local\(/);
        continue;
      }
      expect(face).toContain('font-display: swap');
      for (const url of urls) {
        expect(url.startsWith('/fonts/')).toBe(true);
        expect(fs.existsSync(path.join(fontsDir, url))).toBe(true);
      }
    }
  });

  it('no third-party font origin anywhere in the public shell or CSS', () => {
    for (const text of [html, css]) {
      expect(text).not.toMatch(
        /fonts\.(googleapis|gstatic)\.com|typekit|fonts\.bunny/,
      );
    }
  });
});
