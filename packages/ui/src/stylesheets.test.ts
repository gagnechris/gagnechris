// @vitest-environment node
/// <reference types="vite/client" />
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const components = import.meta.glob<string>(['./*.tsx', '!./*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
// Read from disk: Vitest serves CSS imports empty.
const here = fileURLToPath(new URL('.', import.meta.url));
const stylesheets = readdirSync(here)
  .filter((name) => name.endsWith('.css'))
  .map((name) => readFileSync(here + name, 'utf8'))
  .join('\n');

// The ghost IconButton is the base `.ui-icon-btn` look.
const UNSTYLED = new Set(['ui-icon-btn--ghost']);

describe('stylesheets', () => {
  it.each(Object.entries(components))(
    '%s emits no modifier class without a rule',
    (_file, text) => {
      const modifiers = new Set(
        [...text.matchAll(/'((?:kit|ui)-[a-z0-9-]+--[a-z0-9-]+)'/g)].map(
          ([, name]) => name!,
        ),
      );
      const missing = [...modifiers].filter(
        (name) =>
          !UNSTYLED.has(name) &&
          !new RegExp(`\\.${name}(?![\\w-])`).test(stylesheets),
      );
      expect(missing).toEqual([]);
    },
  );
});
