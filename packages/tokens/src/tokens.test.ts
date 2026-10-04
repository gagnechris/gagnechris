import { describe, expect, it } from 'vitest';
import { tokenCssEntries, tokens, tokensToCssRoot } from './tokens.js';

describe('tokens', () => {
  it('exposes the primary-500 sage green used by the site', () => {
    expect(tokens.primary[500]).toBe('#3d9690');
  });

  it('stores scale tokens as px numbers so React Native can use them', () => {
    expect(tokens.space[4]).toBe(16);
    expect(tokens.text.base).toBe(16);
    expect(tokens.radius.md).toBe(8);
    for (const group of [tokens.space, tokens.text, tokens.radius]) {
      for (const value of Object.values(group)) {
        expect(typeof value).toBe('number');
      }
    }
  });

  it('maps groups to CSS custom property names', () => {
    const map = Object.fromEntries(tokenCssEntries());
    expect(map['--text-base']).toBe('1rem');
    expect(map['--accent-coral']).toBe('#ff7a5c');
    expect(map['--radius-full']).toBe('9999px');
  });

  it('names the public text colours in kebab case, with link aliasing primary-700', () => {
    const map = Object.fromEntries(tokenCssEntries());
    expect(map['--color-ink']).toBe('#16191d');
    expect(map['--color-ink-soft']).toBe('#4a515a');
    expect(map['--color-link']).toBe(tokens.primary[700]);
    expect(map['--font-serif']).toMatch(/^'Newsreader', 'Newsreader Fallback'/);
  });

  it('converts px numbers to rem for CSS without float noise', () => {
    const map = Object.fromEntries(tokenCssEntries());
    expect(map['--space-1']).toBe('0.25rem');
    expect(map['--space-16']).toBe('4rem');
    expect(map['--text-xl']).toBe('1.333rem');
    expect(map['--radius-lg']).toBe('1rem');
  });

  it('derives the px comments from the token values', () => {
    const css = tokensToCssRoot();
    expect(css).toContain('--space-1: 0.25rem; /* 4px */');
    expect(css).toContain('--text-xl: 1.333rem; /* 21.33px */');
    // Already px — a derived comment would just repeat the value.
    expect(css).toContain('--radius-full: 9999px;\n');
  });

  it('generates a :root block with all variables', () => {
    const css = tokensToCssRoot();
    expect(css).toContain(':root {');
    expect(css).toContain('--primary-500: #3d9690;');
    expect(css).toContain('--font-sans:');
    expect(tokenCssEntries().every(([name]) => css.includes(name))).toBe(true);
  });
});
