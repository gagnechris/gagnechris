import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Features, transform } from 'lightningcss';
import postcss, { type ChildNode, type Container, type Root } from 'postcss';
import { escapeHtml } from '@gagnechris/shared/html';
import {
  NOT_FOUND_TEXT,
  NOT_FOUND_TITLE,
  renderNotFoundBodyHtml,
} from '@gagnechris/shared/public-pages';
import { renderSitePageHtml } from '@gagnechris/shared/site-chrome';

/*
 * The 404 page CloudFront returns in place of S3 errors. It can't load the
 * hashed bundle, so it carries the rules from the SPA's own CSS that match its
 * markup, inline. The footer year is filled in when the function runs.
 */

export const NOT_FOUND_YEAR_TOKEN = '{{year}}';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** In the order the SPA loads them. */
const CSS_SOURCES = [
  '../../packages/tokens/src/variables.css',
  'src/index.css',
  'src/public.css',
  'src/pages/NotFound.css',
];

/** Vite's default build target (baseline widely available). */
const CSS_TARGETS = {
  chrome: 107 << 16,
  edge: 107 << 16,
  firefox: 104 << 16,
  safari: 16 << 16,
};

const VAR_REF = /var\(\s*(--[\w-]+)/g;
const VAR_ONLY = /var\(\s*(--[\w-]+)\s*\)/g;

const markupVocabulary = (html: string) => ({
  tags: new Set([
    'html',
    'body',
    ...[...html.matchAll(/<([a-z][a-z0-9]*)/g)].map((m) => m[1]!),
  ]),
  classes: new Set(
    [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)),
  ),
  ids: new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!)),
});

type Vocabulary = ReturnType<typeof markupVocabulary>;

/** Pseudo-classes and attributes are ignored, so `a:hover` counts when there is an `a`. */
function selectorMatches(selector: string, vocab: Vocabulary): boolean {
  const bare = selector
    .replace(/\[[^\]]*\]/g, '')
    .replace(/::?[\w-]+(\([^)]*\))?/g, '');
  return bare
    .split(/[\s>+~]+/)
    .filter(Boolean)
    .every((compound) => {
      const tag = /^[a-z][a-z0-9]*/i.exec(compound)?.[0];
      if (tag && !vocab.tags.has(tag.toLowerCase())) return false;
      const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
      const ids = [...compound.matchAll(/#([\w-]+)/g)].map((m) => m[1]!);
      return (
        classes.every((c) => vocab.classes.has(c)) &&
        ids.every((id) => vocab.ids.has(id))
      );
    });
}

function prune(container: Container, vocab: Vocabulary): void {
  container.each((node: ChildNode) => {
    if (node.type === 'comment') {
      node.remove();
    } else if (node.type === 'atrule') {
      if (node.name === 'import') {
        node.remove();
      } else if (node.name === 'media') {
        prune(node, vocab);
        if (!node.nodes?.length) node.remove();
      }
    } else if (node.type === 'rule') {
      const kept = node.selectors.filter((s) => selectorMatches(s, vocab));
      if (kept.length) node.selectors = kept;
      else node.remove();
    }
  });
}

/** A later rule with the same selector in the same block wins outright. */
function dropOverridden(container: Container): void {
  const later = new Map<string, Set<string>>();
  for (const node of [...(container.nodes ?? [])].reverse()) {
    if (node.type === 'atrule' && node.name === 'media') dropOverridden(node);
    if (node.type !== 'rule') continue;
    const seen = later.get(node.selector) ?? new Set<string>();
    node.each((child) => {
      if (child.type !== 'decl' || child.important) return;
      if (seen.has(child.prop)) child.remove();
    });
    node.each((child) => {
      if (child.type === 'decl') seen.add(child.prop);
    });
    later.set(node.selector, seen);
  }
}

/*
 * Substitutes custom properties with their values. One stays a variable when a
 * media query redefines it, or when repeating its value would cost more bytes.
 */
function inlineCustomProperties(root: Root): void {
  const values = new Map<string, string>();
  const keep = new Set<string>();
  const refs = new Map<string, number>();
  root.walkDecls((decl) => {
    for (const [, name] of decl.value.matchAll(VAR_REF)) {
      refs.set(name!, (refs.get(name!) ?? 0) + 1);
    }
    if (!decl.prop.startsWith('--')) return;
    if (decl.parent?.parent?.type === 'atrule') keep.add(decl.prop);
    else values.set(decl.prop, decl.value);
  });
  const resolve = (value: string, depth = 0): string =>
    depth > 10
      ? value
      : value.replace(VAR_ONLY, (whole, name: string) => {
          const v = values.get(name);
          return v === undefined || keep.has(name)
            ? whole
            : resolve(v, depth + 1);
        });
  for (const [name, value] of values) {
    const n = refs.get(name) ?? 0;
    const inlined = resolve(value).length;
    if (n * inlined > n * (name.length + 5) + name.length + inlined + 2) {
      keep.add(name);
    }
  }
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--') || keep.has(decl.prop)) {
      decl.value = resolve(decl.value);
    }
  });
  const used = new Set<string>();
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--') && !keep.has(decl.prop)) return;
    for (const [, name] of decl.value.matchAll(VAR_REF)) used.add(name!);
  });
  root.walkDecls(/^--/, (decl) => {
    if (!used.has(decl.prop)) decl.remove();
  });
}

function dropEmpty(root: Root): void {
  root.walkRules((rule) => {
    if (!rule.nodes.length) rule.remove();
  });
  root.walkAtRules('media', (media) => {
    if (!media.nodes?.length) media.remove();
  });
}

/** `rootHtml` is everything in `<body>`. */
export function notFoundCriticalCss(rootHtml: string): string {
  const vocab = markupVocabulary(rootHtml);
  const root = postcss.root();
  for (const rel of CSS_SOURCES) {
    const file = path.join(appRoot, rel);
    const parsed = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    prune(parsed, vocab);
    root.append(parsed.nodes);
  }
  dropOverridden(root);
  inlineCustomProperties(root);
  dropEmpty(root);
  const { code } = transform({
    filename: 'not-found.css',
    code: Buffer.from(root.toString()),
    minify: true,
    targets: CSS_TARGETS,
    // Its color-scheme polyfill adds bytes and the page has no dark mode.
    exclude: Features.LightDark,
  });
  return code.toString();
}

export function renderNotFoundDocumentHtml(
  year: number | string = NOT_FOUND_YEAR_TOKEN,
): string {
  const root = `<div id="root">${renderSitePageHtml(null, renderNotFoundBodyHtml(), year)}</div>`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(NOT_FOUND_TITLE)}</title>` +
    `<meta name="robots" content="noindex">` +
    `<meta name="description" content="${escapeHtml(NOT_FOUND_TEXT)}">` +
    `<link rel="icon" type="image/svg+xml" href="/cg-icon.svg">` +
    `<style>${notFoundCriticalCss(root)}</style>` +
    `</head><body>${root}</body></html>`
  );
}

const PACK_MARK = '~';
const PACK_KEYS = 'abcdefghijklmnopqrstuvwxyz';

/** Bytes a string costs in the function source (ASCII-only JS literal). */
const sourceBytes = (value: string): number =>
  JSON.stringify(value).replace(/[^\x20-\x7e]/g, 'uXXXXX').length - 2;

/*
 * CloudFront Functions are capped at 10 KB and have no zlib, so the page ships
 * dictionary-coded: `~a` stands for `dict[0]` and so on, and an entry can use
 * earlier keys (the function expands the last key first). Each round codes
 * the substring that saves the most bytes.
 */
export function packNotFoundHtml(html: string): {
  dict: string[];
  packed: string;
} {
  if (html.includes(PACK_MARK)) {
    throw new Error(`The 404 page contains ${PACK_MARK}, the packing marker`);
  }
  const dict: string[] = [];
  let packed = html;
  for (const key of PACK_KEYS) {
    const counts = new Map<string, number>();
    for (let i = 0; i < packed.length; i += 1) {
      if (packed[i - 1] === PACK_MARK) continue;
      for (let len = 4; len <= 48 && i + len <= packed.length; len += 1) {
        const sub = packed.slice(i, i + len);
        if (sub.endsWith(PACK_MARK)) break;
        counts.set(sub, (counts.get(sub) ?? 0) + 1);
      }
    }
    let best = '';
    let bestGain = 0;
    for (const [sub, overlapping] of counts) {
      const size = sourceBytes(sub);
      const gain = (n: number) => n * (size - 2) - (size + 3);
      if (overlapping < 2 || gain(overlapping) <= bestGain) continue;
      const n = packed.split(sub).length - 1;
      if (gain(n) > bestGain) {
        best = sub;
        bestGain = gain(n);
      }
    }
    if (!best) break;
    dict.push(best);
    packed = packed.split(best).join(PACK_MARK + key);
  }
  return { dict, packed };
}
