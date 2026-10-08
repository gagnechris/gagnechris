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

const APP_ID = 'FF9YB7FZ7A.com.gagnechris.mobile';

describe('apple-app-site-association', () => {
  it('claims no universal links on the apex, only web credentials', () => {
    const apex = aasa('public');
    expect(apex.applinks).toBeUndefined();
    expect(apex.webcredentials?.apps).toEqual([APP_ID]);
  });

  it('opens only Notebook pages in the app and keeps web sign-in out', () => {
    const details = aasa('public-notebook').applinks?.details ?? [];
    expect(details).toEqual([
      {
        appIDs: [APP_ID],
        components: [
          { '/': '/auth/*', exclude: true },
          { '/': '/today' },
          { '/': '/notes/*' },
          { '/': '/tasks/*' },
        ],
      },
    ]);
  });

  // ASWebAuthenticationSession returns an https callback only to an app the
  // callback host lists under webcredentials; applinks don't count.
  it('associates the app with the Notebook host for the https sign-in callback', () => {
    expect(aasa('public-notebook').webcredentials?.apps).toEqual([APP_ID]);
  });
});
