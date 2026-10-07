import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { PALETTE, paletteVar, type PaletteName } from './palette';

const SRC = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const BEARS_FILES = [
  'games/bears/shared/bears-shared.css',
  'games/bears/camp/CampRulesGame.css',
  'games/bears/camp/campGlyphs.tsx',
  'games/bears/wild/StayWildGame.css',
  'games/bears/wild/StayWildGame.tsx',
  'games/bears/wild/WildEndScene.tsx',
  'games/bears/wild/wildRender.ts',
  'pages/DontFeedTheBears.css',
  'pages/DontFeedTheBears.tsx',
  'pages/bears/BearsGamePage.css',
];

describe('bears palette', () => {
  test('bears-shared.css defines every palette colour as a custom property', () => {
    const css = read('games/bears/shared/bears-shared.css');
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const vars = Object.fromEntries(
      [...root.matchAll(/(--bears-[\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [
        k,
        v!.trim(),
      ]),
    );
    const expected = Object.fromEntries(
      (Object.keys(PALETTE) as PaletteName[]).map((name) => [
        paletteVar(name),
        PALETTE[name],
      ]),
    );
    expect(vars).toEqual(expected);
  });

  test('palette colours are not written out as hex anywhere else', () => {
    const hexes = new Set<string>(Object.values(PALETTE));
    const found: string[] = [];
    for (const file of BEARS_FILES) {
      const text = read(file).replace(/:root\s*\{[^}]*\}/, '');
      for (const [hex] of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        if (hexes.has(hex.toLowerCase())) found.push(`${file}: ${hex}`);
      }
    }
    expect(found).toEqual([]);
  });

  test('every var(--bears-*) used in the bears CSS is defined', () => {
    const defined = new Set(
      (Object.keys(PALETTE) as PaletteName[]).map(paletteVar),
    );
    const missing = BEARS_FILES.filter((f) => f.endsWith('.css')).flatMap(
      (file) =>
        [...read(file).matchAll(/var\((--bears-[\w-]+)\)/g)]
          .map(([, name]) => name!)
          .filter((name) => !defined.has(name))
          .map((name) => `${file}: ${name}`),
    );
    expect(missing).toEqual([]);
  });
});
