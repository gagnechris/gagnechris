import { expect, test } from '@playwright/test';
import { requireEnv } from '../fixtures';

const ADMIN = 'https://admin.gagnechris.com';
const NOTEBOOK = 'https://notebook.gagnechris.com';

test.describe('old apex /admin and /auth URLs', () => {
  // The local site server runs the real apex viewer-request function.
  const site = () => requireEnv('E2E_SITE_URL');

  for (const [path, location] of [
    ['/admin', `${ADMIN}/`],
    ['/admin/posts?tab=meta', `${ADMIN}/posts?tab=meta`],
    ['/admin/notebook', `${NOTEBOOK}/`],
    [
      '/admin/notebook/today?date=2026-10-03',
      `${NOTEBOOK}/today?date=2026-10-03`,
    ],
    ['/Admin/Notebook/notes/01J9ZX', `${NOTEBOOK}/notes/01J9ZX`],
    ['/auth/callback?code=c&state=s', `${NOTEBOOK}/`],
    ['/AUTH', `${NOTEBOOK}/`],
  ] as const) {
    test(`${path} → ${location}`, async ({ request }) => {
      const res = await request.get(`${site()}${path}`, { maxRedirects: 0 });
      expect(res.status()).toBe(301);
      expect(res.headers()['location']).toBe(location);
      expect(res.headers()['cache-control']).toBe('max-age=86400');
    });
  }

  test('/.well-known stays on the apex', async ({ request }) => {
    const res = await request.get(
      `${site()}/.well-known/apple-app-site-association`,
      { maxRedirects: 0 },
    );
    expect(res.status()).not.toBe(301);
    expect(res.headers()['location']).toBeUndefined();
  });
});

test('the public site deletes leftover Cognito cookies and localStorage keys', async ({
  context,
  page,
}) => {
  const site = requireEnv('E2E_SITE_URL');
  const apex = 'https://gagnechris.com';
  // Serve the built site as the apex, so Domain=gagnechris.com cookies apply.
  // Not the dev server: its HMR WebSocket to wss://gagnechris.com bypasses
  // routing, and WebKit's network process can crash on it, dropping every
  // cookie in the context.
  await context.route(/googletagmanager|google-analytics/, (route) =>
    route.abort(),
  );
  await context.route(`${apex}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${site}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });

  const legacy = 'CognitoIdentityServiceProvider.3kbdi3gk4bngftgo0useo980nb';
  await context.addCookies([
    {
      name: `${legacy}.owner.refreshToken`,
      value: 'eyJdomain',
      domain: '.gagnechris.com',
      path: '/',
      secure: true,
    },
    {
      name: `${legacy}.LastAuthUser`,
      value: 'owner',
      url: `${apex}/`,
    },
    { name: 'consent', value: 'yes', url: `${apex}/` },
  ]);
  // Runs before the page's own scripts on every load, like a leftover session.
  await context.addInitScript((prefix) => {
    localStorage.setItem(`${prefix}.owner.idToken`, 'eyJstorage');
    localStorage.setItem(`${prefix}.inflightOAuth`, 'true');
    localStorage.setItem('theme', 'dark');
  }, legacy);

  await page.goto(`${apex}/`);
  await expect(page.locator('#root')).not.toBeEmpty();

  await expect
    .poll(async () => (await context.cookies(apex)).map((c) => c.name))
    .toEqual(['consent']);
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([
    'theme',
  ]);
});
