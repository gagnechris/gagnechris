import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Features, transform } from 'lightningcss';
import postcss, { type ChildNode, type Container, type Root } from 'postcss';
import { escapeHtml } from '@gagnechris/shared/html';
import {
  NOT_FOUND_DESCRIPTION,
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
  attributes: new Set(
    [...html.matchAll(/\s([a-z-]+)=/g)].map((m) => m[1]!.toLowerCase()),
  ),
});

type Vocabulary = ReturnType<typeof markupVocabulary>;

/** Pseudo-classes are ignored, so `a:hover` counts when there is an `a`; an attribute only has to appear somewhere. */
function selectorMatches(selector: string, vocab: Vocabulary): boolean {
  const attributes = [...selector.matchAll(/\[\s*([\w-]+)/g)].map((m) =>
    m[1]!.toLowerCase(),
  );
  if (!attributes.every((a) => vocab.attributes.has(a))) return false;
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
 * media query or a second rule redefines it, or when repeating its value would
 * cost more bytes.
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
    const earlier = values.get(decl.prop);
    if (decl.parent?.parent?.type === 'atrule') keep.add(decl.prop);
    else if (earlier !== undefined && earlier !== decl.value) {
      keep.add(decl.prop);
    } else values.set(decl.prop, decl.value);
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

/** Short names for the custom properties that stay. */
function renameCustomProperties(root: Root): void {
  const names = new Map<string, string>();
  const short = (name: string) => {
    if (!names.has(name)) names.set(name, `--v${names.size.toString(36)}`);
    return names.get(name)!;
  };
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) decl.prop = short(decl.prop);
    decl.value = decl.value.replace(
      VAR_REF,
      (_whole, name: string) => `var(${short(name)}`,
    );
  });
}

/** Drops faces for a style nothing uses, such as the italic. */
function dropUnusedFontFaces(root: Root): void {
  const styles = new Set(['normal']);
  root.walkDecls('font-style', (decl) => {
    if (decl.parent?.type !== 'atrule') styles.add(decl.value);
  });
  root.walkAtRules('font-face', (face) => {
    let style = 'normal';
    face.walkDecls('font-style', (decl) => {
      style = decl.value;
    });
    if (!styles.has(style)) face.remove();
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
  renameCustomProperties(root);
  dropUnusedFontFaces(root);
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
    `<meta name="description" content="${escapeHtml(NOT_FOUND_DESCRIPTION)}">` +
    `<link rel="icon" type="image/svg+xml" href="/cg-icon.svg">` +
    `<style>${notFoundCriticalCss(root)}</style>` +
    `</head><body>${root}</body></html>`
  );
}
