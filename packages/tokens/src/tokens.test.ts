import { describe, expect, it } from 'vitest';
import { tokenCssEntries, tokens, tokensToCssRoot } from './tokens.js';

describe('tokens', () => {
  it('exposes the primary-500 sage green used by the site', () => {
    expect(tokens.primary[500]).toBe('#3d9690');
  });

  it('maps groups to CSS custom property names', () => {
    const map = Object.fromEntries(tokenCssEntries());
    expect(map['--text-base']).toBe('1rem');
    expect(map['--accent-coral']).toBe('#ff7a5c');
    expect(map['--radius-full']).toBe('9999px');
  });

  it('generates a :root block with all variables', () => {
    const css = tokensToCssRoot();
    expect(css).toContain(':root {');
    expect(css).toContain('--primary-500: #3d9690;');
    expect(css).toContain('--font-sans:');
    expect(tokenCssEntries().every(([name]) => css.includes(name))).toBe(true);
  });
});
