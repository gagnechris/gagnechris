// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, type Plugin, type PluginOption, type UserConfig } from 'vite';
import type { RolldownOutput } from 'rolldown';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsPlugin,
  gaMeasurementId,
} from '../../scripts/analyticsPlugin';
import viteConfig from '../../vite.config';

const webRoot = path.resolve(__dirname, '../..');
const deployScript = fs.readFileSync(
  path.join(webRoot, '../../scripts/deploy-web.sh'),
  'utf8',
);

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of roots.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

async function buildShell(measurementId: string | undefined) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-build-'));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><html><head><title>t</title></head><body><script type="module" src="./main.ts"></script></body></html>',
  );
  fs.writeFileSync(path.join(root, 'main.ts'), 'console.log(1);\n');
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [analyticsPlugin(measurementId)],
    build: { write: false },
  })) as RolldownOutput;
  const files = new Map(
    output.output.map((file) => [
      file.fileName,
      file.type === 'asset' ? String(file.source) : file.code,
    ]),
  );
  return { html: files.get('index.html') ?? '', files };
}

const resolveConfig = (command: 'build' | 'serve') =>
  (viteConfig as (env: { command: string; mode: string }) => UserConfig)({
    command,
    mode: 'production',
  });

const findPlugin = (plugins: PluginOption[] | undefined, name: string) =>
  (plugins ?? [])
    .flat(Infinity as 1)
    .find((p): p is Plugin => Boolean(p && 'name' in p && p.name === name));

describe('GA in the public build', () => {
  it('loads gtag.js and the /ga.js bootstrap when a measurement ID is set', async () => {
    const { html, files } = await buildShell('G-TEST123');
    expect(html).toContain(
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST123"></script>',
    );
    expect(html).toContain('<script defer src="/ga.js"></script>');
    expect(files.get('ga.js')).toBe(`window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'G-TEST123');
`);
  });

  it('loads no GA and writes no bootstrap without a measurement ID', async () => {
    const { html, files } = await buildShell(undefined);
    expect(html).not.toMatch(/googletagmanager|google-analytics|gtag|ga\.js/);
    expect(files.has('ga.js')).toBe(false);
  });

  it('rejects a value that is not a GA4 measurement ID', () => {
    expect(() => gaMeasurementId('G-X"><script>')).toThrow(
      /not a GA4 measurement ID/,
    );
    expect(gaMeasurementId('  ')).toBeUndefined();
  });

  it('sets the production property only in the deploy build', () => {
    const assignment = /^GA_MEASUREMENT_ID="([^"]+)"$/m.exec(deployScript);
    expect(assignment?.[1]).toBe('G-CDG30T24XY');
    expect(gaMeasurementId(assignment?.[1])).toBe('G-CDG30T24XY');
    const exported = deployScript.indexOf('GA_MEASUREMENT_ID\n');
    const built = deployScript.indexOf('npm run build -w @gagnechris/web');
    expect(exported).toBeGreaterThan(assignment!.index);
    expect(built).toBeGreaterThan(exported);
  });

  it('wires GA_MEASUREMENT_ID into the public build config and the page-view ID', () => {
    vi.stubEnv('WEB_APP', 'public');
    vi.stubEnv('GA_MEASUREMENT_ID', 'G-CDG30T24XY');
    vi.stubEnv('VITEST', '');
    const config = resolveConfig('build');
    const plugin = findPlugin(config.plugins, 'analytics');
    const tags = (plugin?.transformIndexHtml as () => unknown)();
    expect(JSON.stringify(tags)).toContain('gtag/js?id=G-CDG30T24XY');
    expect(config.define?.['import.meta.env.VITE_GA_MEASUREMENT_ID']).toBe(
      '"G-CDG30T24XY"',
    );
  });

  it.each(['serve', 'build'] as const)(
    'leaves GA off in a %s without GA_MEASUREMENT_ID',
    (command) => {
      vi.stubEnv('WEB_APP', 'public');
      vi.stubEnv('GA_MEASUREMENT_ID', '');
      vi.stubEnv('VITEST', '');
      const config = resolveConfig(command);
      const plugin = findPlugin(config.plugins, 'analytics');
      expect((plugin?.transformIndexHtml as () => unknown)()).toEqual([]);
      expect(config.define?.['import.meta.env.VITE_GA_MEASUREMENT_ID']).toBe(
        '""',
      );
    },
  );

  it('ignores GA_MEASUREMENT_ID on the dev server', () => {
    vi.stubEnv('WEB_APP', 'public');
    vi.stubEnv('GA_MEASUREMENT_ID', 'G-CDG30T24XY');
    vi.stubEnv('VITEST', '');
    const config = resolveConfig('serve');
    expect(config.define?.['import.meta.env.VITE_GA_MEASUREMENT_ID']).toBe(
      '""',
    );
  });
});
