// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

type Aasa = {
  applinks?: {
    details?: {
      paths?: string[];
      components?: { '/': string; exclude?: boolean }[];
    }[];
  };
  webcredentials?: { apps: string[] };
};

const aasa = (publicDir: string): Aasa =>
  JSON.parse(
    fs.readFileSync(
      path.join(webRoot, publicDir, '.well-known/apple-app-site-association'),
      'utf8',
    ),
  ) as Aasa;

describe('apple-app-site-association', () => {
  it('claims no universal links on the apex, only web credentials', () => {
    const apex = aasa('public');
    expect(apex.applinks).toBeUndefined();
    expect(apex.webcredentials?.apps).toEqual([
      'APPLE_TEAM_ID.com.gagnechris.mobile',
    ]);
  });

  it('keeps web sign-in on the Notebook host out of the app', () => {
    const details = aasa('public-notebook').applinks?.details ?? [];
    expect(details).toHaveLength(1);
    const components = details[0]!.components ?? [];
    expect(components[0]).toEqual({ '/': '/auth/*', exclude: true });
    expect(
      components.filter((c) => c['/'].startsWith('/auth') && !c.exclude),
    ).toEqual([]);
    expect(details[0]!.paths).toBeUndefined();
  });
});
