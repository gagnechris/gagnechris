import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GA = /googletagmanager|google-analytics|\bgtag\b/i;
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

const LINK_TAG = /<link\b[^>]*>/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const FONT_FILE = /\.(?:woff2?|ttf|otf)(?:[?#].*)?$/i;
/** deploy-web.sh uploads these two paths with an immutable Cache-Control. */
const HASHED_FONT = /^\/fonts\/[\w-]+\.([0-9a-f]{8})\.woff2$/;
const VITE_ASSET = /^\/assets\/[^/]+$/;

const read = (file: string): string | null =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

/** Signed-in shells run under `script-src 'self'`: bundled scripts only. */
function appShellProblems(label: string, html: string | null): string[] {
  if (html === null) return [`${label} is missing`];
  const problems: string[] = [];
  if (GA.test(html)) problems.push(`${label} references Google Analytics`);
  for (const [, attrs = '', body = ''] of html.matchAll(SCRIPT_TAG)) {
    const src = /\bsrc=["']([^"']*)["']/i.exec(attrs)?.[1];
    if (!src || body.trim() !== '') {
      problems.push(`${label} has an inline <script>`);
    } else if (!src.startsWith('/assets/')) {
      problems.push(`${label} loads a script that is not bundled: ${src}`);
    }
  }
  return problems;
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}=["']([^"']*)["']`, 'i').exec(tag)?.[1];

/** Why `url` can't be cached as immutable from this build, or null if it can. */
function fontUrlProblem(dist: string, url: string): string | null {
  const file = url.replace(/[?#].*$/, '');
  if (
    !file.startsWith('/') ||
    file.startsWith('//') ||
    !fs.existsSync(path.join(dist, file))
  ) {
    return 'is not in dist';
  }
  if (VITE_ASSET.test(file)) return null;
  const hash = HASHED_FONT.exec(file)?.[1];
  if (!hash)
    return 'is not a hashed /fonts/<name>.<sha256:8>.woff2 or /assets/ file';
  const actual = createHash('sha256')
    .update(fs.readFileSync(path.join(dist, file)))
    .digest('hex')
    .slice(0, 8);
  return actual === hash
    ? null
    : `is named for hash ${hash} but its content hashes to ${actual}`;
}

/**
 * The public shell preloads exactly one self-hosted font, and every font the
 * public CSS loads is self-hosted (no third-party font origin) under a name
 * that changes with its content.
 */
function publicFontProblems(dist: string, html: string): string[] {
  const problems: string[] = [];
  const preloads = [...html.matchAll(LINK_TAG)]
    .map(([tag]) => tag)
    .filter(
      (tag) =>
        attr(tag, 'rel')?.toLowerCase() === 'preload' &&
        attr(tag, 'as')?.toLowerCase() === 'font',
    );
  if (preloads.length !== 1) {
    problems.push(
      `dist/_shell.html preloads ${preloads.length} fonts (expected 1)`,
    );
  }
  for (const tag of preloads) {
    const href = attr(tag, 'href') ?? '';
    const problem = fontUrlProblem(dist, href);
    if (problem) {
      problems.push(
        `dist/_shell.html preloads a font that ${problem}: ${href}`,
      );
    }
  }

  const assets = path.join(dist, 'assets');
  const css = fs.existsSync(assets)
    ? fs.readdirSync(assets).filter((name) => name.endsWith('.css'))
    : [];
  for (const name of css) {
    const body = fs.readFileSync(path.join(assets, name), 'utf8');
    for (const [, url = ''] of body.matchAll(CSS_URL)) {
      if (!FONT_FILE.test(url)) continue;
      const problem = fontUrlProblem(dist, url);
      if (problem) {
        problems.push(`assets/${name} loads a font that ${problem}: ${url}`);
      }
    }
  }
  return problems;
}

type ManifestChunk = {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
};

/** Vite manifest `src` paths are relative to apps/web. */
export const DEMO_SRC_DIR = 'src/demos/';

/**
 * Every demo under `src/demos/<id>/index.tsx` must be its own lazy chunk that
 * nothing on the entry's static import graph pulls in, so a page without a
 * demo loads none of its JS.
 */
export function demoChunkProblems(
  manifest: Record<string, ManifestChunk>,
  demoEntries: readonly string[],
): string[] {
  const problems: string[] = [];
  const entry = Object.entries(manifest).find(([, c]) => c.isEntry);
  if (!entry) return ['the public build manifest has no entry chunk'];

  const staticKeys = new Set<string>();
  const queue = [entry[0]];
  while (queue.length) {
    const key = queue.pop()!;
    if (staticKeys.has(key)) continue;
    staticKeys.add(key);
    queue.push(...(manifest[key]?.imports ?? []));
  }
  for (const key of staticKeys) {
    const src = manifest[key]?.src ?? key;
    if (src.startsWith(DEMO_SRC_DIR)) {
      problems.push(`${src} is statically imported by the public entry`);
    }
  }
  for (const src of demoEntries) {
    const chunk = manifest[src];
    if (!chunk) {
      problems.push(`${src} has no chunk of its own (bundled into another)`);
    } else if (!chunk.isDynamicEntry) {
      problems.push(`${src} is not loaded with a dynamic import()`);
    }
  }
  return problems;
}

const demoEntries = (webRoot: string): string[] => {
  const dir = path.join(webRoot, DEMO_SRC_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${DEMO_SRC_DIR}${d.name}/index.tsx`)
    .filter((src) => fs.existsSync(path.join(webRoot, src)));
};

/** Returns every problem with the built shells; empty means they pass. */
export function checkWebShells(webRoot: string): string[] {
  const problems: string[] = [];
  const dist = path.join(webRoot, 'dist');

  for (const shell of ['index.html', '_shell.html']) {
    const html = read(path.join(dist, shell));
    if (html === null) problems.push(`dist/${shell} is missing`);
    else if (!GA.test(html))
      problems.push(`dist/${shell} lost Google Analytics`);
  }

  const shell = read(path.join(dist, '_shell.html'));
  if (shell !== null) problems.push(...publicFontProblems(dist, shell));

  const manifest = read(path.join(dist, '.vite', 'manifest.json'));
  if (manifest === null) problems.push('dist/.vite/manifest.json is missing');
  else {
    problems.push(
      ...demoChunkProblems(
        JSON.parse(manifest) as Record<string, ManifestChunk>,
        demoEntries(webRoot),
      ),
    );
  }

  for (const app of ['dist-admin', 'dist-notebook']) {
    problems.push(
      ...appShellProblems(
        `${app}/index.html`,
        read(path.join(webRoot, app, 'index.html')),
      ),
    );
  }

  const pwaManifest = read(
    path.join(webRoot, 'dist-notebook', 'manifest.json'),
  );
  if (pwaManifest === null) {
    problems.push('dist-notebook/manifest.json is missing');
  } else {
    const parsed = JSON.parse(pwaManifest) as Record<string, unknown>;
    for (const key of ['id', 'start_url', 'scope']) {
      if (parsed[key] !== '/') {
        problems.push(`dist-notebook/manifest.json ${key} must be "/"`);
      }
    }
  }
  return problems;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const webRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const problems = checkWebShells(webRoot);
  if (problems.length > 0) {
    console.error(`Web shell check failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    'Web shells OK: GA and one self-hosted font preload on the public shell, fonts named for their content, demos only in lazy chunks, app shells load bundled scripts only.',
  );
}
