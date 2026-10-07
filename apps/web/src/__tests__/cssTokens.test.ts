// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breakpoint } from '@gagnechris/tokens';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The bears games keep their own palette and layout widths. */
const BEARS = /^games[/\\]bears[/\\]/;
const BEARS_PALETTE_FILES = new Set(['pages/DontFeedTheBears.css']);
const BEARS_PALETTE = new Set(['#8a4b25', '#cfe6ef', '#f6e3c8']);

const cssFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });

const sheets = cssFiles(src)
  .map((file) => ({
    rel: path.relative(src, file).split(path.sep).join('/'),
    css: fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }))
  .filter(({ rel }) => !BEARS.test(rel));

describe('web stylesheets use the design tokens', () => {
  it('covers the public, kit and workspace styles', () => {
    expect(sheets.map((s) => s.rel)).toEqual(
      expect.arrayContaining([
        'public.css',
        'pages/PostPage.css',
        'kit/kit.css',
        'workspace/workspace.css',
      ]),
    );
  });

  it('write no raw hex colours outside the bears palette', () => {
    const found = sheets.flatMap(({ rel, css }) =>
      [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)]
        .map((m) => m[0].toLowerCase())
        .filter(
          (hex) => !(BEARS_PALETTE_FILES.has(rel) && BEARS_PALETTE.has(hex)),
        )
        .map((hex) => `${rel} ${hex}`),
    );
    expect(found).toEqual([]);
  });

  it('take monospace from --font-mono', () => {
    const found = sheets
      .filter(({ css }) => /monospace/.test(css))
      .map(({ rel }) => rel);
    expect(found).toEqual([]);
  });

  it('take the 13, 17 and 19px text steps from the scale', () => {
    const found = sheets.flatMap(({ rel, css }) =>
      [...css.matchAll(/font-size:\s*(0\.8125|1\.0625|1\.1875)rem/g)].map(
        (m) => `${rel} ${m[1]}rem`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('only break at token widths (a max-width may sit 1px below one)', () => {
    const widths = new Set<number>(Object.values(breakpoint));
    const found = sheets.flatMap(({ rel, css }) =>
      [...css.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)]
        .filter(([, kind, px]) => {
          const n = Number(px);
          return !(widths.has(n) || (kind === 'max' && widths.has(n + 1)));
        })
        .map(([query]) => `${rel} ${query}`),
    );
    expect(found).toEqual([]);
  });

  it('keep the Home sections in one stylesheet that Home and the posts demo both import', () => {
    const imports = (file: string) =>
      fs.readFileSync(path.join(src, file), 'utf8');
    expect(imports('App.tsx')).toContain("import './home/homeSections.css';");
    expect(imports('demos/posts/index.tsx')).toContain(
      "import '../../home/homeSections.css';",
    );
    const app = sheets.find((s) => s.rel === 'App.css')!.css;
    expect(app).not.toMatch(/\.home-(section|posts?\b|post__)/);
  });
});
