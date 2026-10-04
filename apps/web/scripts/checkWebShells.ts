import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GA = /googletagmanager|google-analytics|\bgtag\b/i;
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

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

  for (const app of ['dist-admin', 'dist-notebook']) {
    problems.push(
      ...appShellProblems(
        `${app}/index.html`,
        read(path.join(webRoot, app, 'index.html')),
      ),
    );
  }

  const manifest = read(path.join(webRoot, 'dist-notebook', 'manifest.json'));
  if (manifest === null) {
    problems.push('dist-notebook/manifest.json is missing');
  } else {
    const parsed = JSON.parse(manifest) as Record<string, unknown>;
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
    'Web shells OK: GA on the public shell only, app shells load bundled scripts only.',
  );
}
