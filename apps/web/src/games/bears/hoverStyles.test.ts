import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Vitest doesn't process CSS, so `?raw` imports come back empty; read the files.
const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const campCss = read('camp/CampRulesGame.css');
const sharedCss = read('shared/bears-shared.css');
const wildCss = read('wild/StayWildGame.css');

/** Declarations from every rule whose selector list includes `selector`. */
function rulesFor(css: string, selector: string): string {
  const bodies: string[] = [];
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selectors, body] of noComments.matchAll(
    /([^{}]+)\{([^}]*)\}/g,
  )) {
    if (
      selectors!
        .split(',')
        .map((s) => s.trim())
        .includes(selector)
    ) {
      bodies.push(body!);
    }
  }
  return bodies.join('\n');
}

// index.css has `button:hover { transform: translateY(-2px); background-color: … }`,
// which outranks single-class rules. Game buttons must override it on hover.
describe('game buttons override the site-wide button hover', () => {
  test('camp items and bears keep their centering transform', () => {
    expect(rulesFor(campCss, '.camp-item:hover')).toMatch(
      /transform:\s*translate\(-50%,\s*-50%\)/,
    );
    expect(rulesFor(campCss, '.camp-bear:hover')).toMatch(
      /transform:\s*translate\(-50%,\s*-50%\)/,
    );
  });

  test('camp buttons keep their own colors', () => {
    expect(rulesFor(campCss, '.camp-item:hover')).toMatch(/background-color/);
    expect(rulesFor(campCss, '.camp-bear:hover')).toMatch(/background-color/);
    expect(rulesFor(campCss, '.camp-link-btn:hover')).toMatch(
      /background-color/,
    );
  });

  test('ghost buttons stay white', () => {
    expect(rulesFor(sharedCss, '.bears-btn--ghost:hover')).toMatch(
      /background-color:\s*white/,
    );
  });

  test('Stay Wild controls keep their colors and do not lift', () => {
    expect(rulesFor(wildCss, '.wild-hud__sniff:hover')).toMatch(
      /transform:\s*none/,
    );
    expect(rulesFor(wildCss, '.wild-hud__pause:hover')).toMatch(
      /transform:\s*none/,
    );
    expect(rulesFor(wildCss, '.wild-hud__pause:hover')).toMatch(
      /background-color/,
    );
  });
});
