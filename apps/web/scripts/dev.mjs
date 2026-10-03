// Starts one Vite dev server per app (public :5173, admin :5174, notebook
// :5175). Pass app names to start a subset: `npm run dev -- notebook`.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const viteBin = path.join(
  path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin',
  'vite.js',
);

const APPS = ['public', 'admin', 'notebook'];
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const viteArgs = process.argv.slice(2).filter((arg) => arg.startsWith('-'));
const unknown = requested.filter((name) => !APPS.includes(name));
if (unknown.length > 0) {
  console.error(
    `Unknown app(s): ${unknown.join(', ')}. Use ${APPS.join(', ')}.`,
  );
  process.exit(1);
}

const children = (requested.length > 0 ? requested : APPS).map((app) =>
  spawn(process.execPath, [viteBin, ...viteArgs], {
    stdio: 'inherit',
    env: { ...process.env, WEB_APP: app },
  }),
);

let exiting = false;
const stopAll = (code) => {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = code;
};

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 1));
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(0));
}
