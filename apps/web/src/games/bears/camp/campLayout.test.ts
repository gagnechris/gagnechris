import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const css = fs
  .readFileSync(path.resolve(__dirname, 'CampRulesGame.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const rule = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, sel]) => sel!.split(',').some((s) => s.trim() === selector))
    .map(([, , body]) => body)
    .join('\n');

describe('Camp layout CSS', () => {
  test('the field is a plain box: no :has() and no clip-path tricks', () => {
    expect(css).not.toMatch(/:has\(/);
    expect(rule('.camp-field')).not.toMatch(/clip-path/);
    expect(rule('.camp')).not.toMatch(/overflow/);
  });
});
