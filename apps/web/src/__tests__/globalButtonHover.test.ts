// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiSrc = path.resolve(src, '../../../packages/ui/src');

const cssFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });

const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]+)\{([^{}]*)\}/g)]
    .filter(([, prelude]) => !prelude!.trim().startsWith('@'))
    .map(([, prelude, body]) => ({
      selectors: prelude!.split(',').map((s) => s.trim()),
      body: body!,
    }));

const withoutWhere = (selector: string) =>
  selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');

const globalButtonHoverSelectors = cssFiles(src).flatMap((file) =>
  rules(fs.readFileSync(file, 'utf8')).flatMap(({ selectors }) =>
    selectors
      .filter(
        (selector) =>
          /\bbutton\b/.test(selector) &&
          selector.includes(':hover') &&
          // No class, id or attribute outside :where(): it reaches every button.
          !/[.#[]/.test(withoutWhere(selector)),
      )
      .map((selector) => [path.relative(src, file), selector] as const),
  ),
);

describe('global button hover rules', () => {
  it('finds the site-wide hover lift and the app reset', () => {
    expect(globalButtonHoverSelectors.map(([file]) => file)).toEqual(
      expect.arrayContaining(['index.css', 'workspace/shell.css']),
    );
  });

  // Anything more specific than `button` beats a component's class rule and
  // repaints library controls on hover.
  it.each(globalButtonHoverSelectors)(
    '%s `%s` is no more specific than `button`',
    (_file, selector) => {
      expect(withoutWhere(selector)).toBe('button');
    },
  );

  it('the search clear button is centred without a transform an app rule could reset', () => {
    const transforms = rules(
      fs.readFileSync(path.join(uiSrc, 'field.css'), 'utf8'),
    ).filter(
      ({ selectors, body }) =>
        selectors.some((s) => s.includes('kit-search-input__clear')) &&
        /(^|[\s;])transform\s*:/.test(body),
    );
    expect(transforms).toEqual([]);
  });
});
