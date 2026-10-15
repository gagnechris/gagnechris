// @vitest-environment node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { tokenCssEntries } from '@gagnechris/tokens';

// The contact form's fields are the editorial TextInput and TextArea.
const css = fs.readFileSync(
  createRequire(import.meta.url).resolve('@gagnechris/ui/field.css'),
  'utf8',
);
const tokens = Object.fromEntries(tokenCssEntries());

const resolve = (value: string): string => {
  const ref = /^var\((--[\w-]+)\)$/.exec(value.trim());
  return ref ? resolve(tokens[ref[1]!] ?? '') : value.trim();
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

const contrastOnWhite = (hex: string): number => 1.05 / (luminance(hex) + 0.05);

describe('Contact field border', () => {
  // WCAG 1.4.11: a control's boundary needs 3:1 against its background.
  it('has at least 3:1 contrast against white', () => {
    const declared =
      /\.kit-input--editorial\s*{[^}]*border-color:\s*([^;]+);/.exec(css)![1]!;
    const color = resolve(declared);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastOnWhite(color)).toBeGreaterThanOrEqual(3);
  });
});
