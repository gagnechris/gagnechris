import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { requireEnv } from '../fixtures';
import { E2E_COGNITO } from '../stack';

/**
 * The admin and Notebook production builds against a stand-in for Cognito
 * managed login, which keeps a session for the whole pool: while it lasts,
 * authorize redirects straight back with a code (that's the documented
 * behaviour for any app client in the pool); without it, it shows a sign-in
 * page.
 */
const AUTH = `https://${E2E_COGNITO.authDomain}`;
const TOKEN_KEY = /^CognitoIdentityServiceProvider\./;
const USER = { sub: 'e2e-cognito-user', email: 'cognito-owner@e2e.test' };

type Authorize = {
  clientId: string;
  redirectUri: string;
  prompt: string | null;
};

function jwt(payload: Record<string, unknown>): string {
  const part = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${part({ alg: 'RS256', kid: 'e2e' })}.${part(payload)}.c2ln`;
}

function tokens(clientId: string) {
  const now = Math.floor(Date.now() / 1000);
  const common = {
    sub: USER.sub,
    iss: `https://cognito-idp.us-east-1.amazonaws.com/${E2E_COGNITO.userPoolId}`,
    iat: now,
    auth_time: now,
    exp: now + 3600,
  };
  return {
    id_token: jwt({
      ...common,
      aud: clientId,
      token_use: 'id',
      email: USER.email,
      'cognito:username': USER.sub,
      'cognito:groups': ['site-admin', 'notebook', 'user-admin'],
    }),
    access_token: jwt({
      ...common,
      client_id: clientId,
      token_use: 'access',
      username: USER.sub,
      scope: 'openid email profile',
      // Cognito sets this when token revocation is on; Amplify only revokes
      // on sign-out if it's present.
      origin_jti: `jti-${clientId}`,
    }),
    refresh_token: `refresh-${clientId}`,
    expires_in: 3600,
    token_type: 'Bearer',
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};

class FakeManagedLogin {
  session = false;
  prompts = 0;
  authorizes: Authorize[] = [];
  revoked: string[] = [];
  logouts: { clientId: string; logoutUri: string }[] = [];
  globalSignOuts = 0;

  async install(context: BrowserContext): Promise<void> {
    await context.route(`${AUTH}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      // WebKit can't fulfil a route with a 3xx, so redirect from a page.
      const redirect = (location: string) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><script>location.replace(${JSON.stringify(location)})</script>`,
        });
      const back = (redirectUri: string, state: string, clientId: string) =>
        redirect(
          `${redirectUri}?code=${clientId}-code&state=${encodeURIComponent(state)}`,
        );

      switch (url.pathname) {
        case '/oauth2/authorize': {
          const clientId = url.searchParams.get('client_id') ?? '';
          const redirectUri = url.searchParams.get('redirect_uri') ?? '';
          const state = url.searchParams.get('state') ?? '';
          this.authorizes.push({
            clientId,
            redirectUri,
            prompt: url.searchParams.get('prompt'),
          });
          if (this.session && url.searchParams.get('prompt') !== 'login') {
            return back(redirectUri, state, clientId);
          }
          this.prompts += 1;
          const next = new URL(`${AUTH}/login`);
          next.search = url.search;
          return route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><title>Sign in</title><h1>Sign in</h1><a href="${next}">Continue with passkey</a>`,
          });
        }
        case '/login': {
          this.session = true;
          return back(
            url.searchParams.get('redirect_uri') ?? '',
            url.searchParams.get('state') ?? '',
            url.searchParams.get('client_id') ?? '',
          );
        }
        case '/oauth2/token': {
          const form = new URLSearchParams(request.postData() ?? '');
          const clientId = form.get('client_id') ?? '';
          expect(form.get('code')).toBe(`${clientId}-code`);
          return route.fulfill({ headers: CORS, json: tokens(clientId) });
        }
        case '/logout': {
          this.session = false;
          const logoutUri = url.searchParams.get('logout_uri') ?? '';
          this.logouts.push({
            clientId: url.searchParams.get('client_id') ?? '',
            logoutUri,
          });
          return redirect(logoutUri);
        }
        default:
          return route.fulfill({ status: 404, body: 'not found' });
      }
    });
    // RevokeToken and GlobalSignOut are user-pool API calls, not OAuth endpoints.
    await context.route(
      'https://cognito-idp.us-east-1.amazonaws.com/**',
      (route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') {
          return route.fulfill({ status: 204, headers: CORS });
        }
        const target = request.headers()['x-amz-target'] ?? '';
        if (target.endsWith('.RevokeToken')) {
          this.revoked.push(JSON.parse(request.postData() ?? '{}').ClientId);
        } else if (target.endsWith('.GlobalSignOut')) {
          this.globalSignOuts += 1;
        }
        return route.fulfill({ headers: CORS, json: {} });
      },
    );
  }
}

/** Everything a script on this origin can read that might be a token. */
async function readableSecrets(page: Page) {
  return page.evaluate(() => ({
    cookie: document.cookie,
    keys: Object.keys(window.localStorage),
    values: Object.values(window.localStorage).join('\n'),
  }));
}

async function signInThroughPrompt(page: Page, login: FakeManagedLogin) {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const before = login.prompts;
  await page.getByRole('link', { name: 'Continue with passkey' }).click();
  expect(login.prompts).toBe(before);
}

const admin = () => requireEnv('E2E_ADMIN_AUTH_URL');
const notebook = () => requireEnv('E2E_NOTEBOOK_AUTH_URL');
const publicSite = () => requireEnv('E2E_PUBLIC_URL');

test.describe('admin and Notebook sign-in', () => {
  let login: FakeManagedLogin;

  test.beforeEach(async ({ context }) => {
    login = new FakeManagedLogin();
    await login.install(context);
  });

  test('each app signs in with its own client and keeps its tokens on its own origin', async ({
    page,
  }) => {
    await page.goto(`${admin()}/resume`);
    await signInThroughPrompt(page, login);
    await expect(page).toHaveURL(`${admin()}/resume`);
    await expect(page.getByText(USER.email)).toBeVisible();

    // Within the managed-login session the second app signs in without a prompt.
    await page.goto(`${notebook()}/tasks`);
    await expect(page).toHaveURL(`${notebook()}/tasks?area=work`);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    expect(login.prompts).toBe(1);

    expect(login.authorizes).toEqual([
      {
        clientId: E2E_COGNITO.adminClientId,
        redirectUri: `${admin()}/auth/callback`,
        prompt: null,
      },
      {
        clientId: E2E_COGNITO.notebookClientId,
        redirectUri: `${notebook()}/auth/callback`,
        prompt: null,
      },
    ]);

    const notebookStore = await readableSecrets(page);
    expect(notebookStore.cookie).toBe('');
    const notebookTokens = notebookStore.keys.filter((k) => TOKEN_KEY.test(k));
    expect(notebookTokens.some((k) => k.endsWith('.refreshToken'))).toBe(true);
    expect(
      notebookTokens.every((k) =>
        k.includes(`.${E2E_COGNITO.notebookClientId}.`),
      ),
    ).toBe(true);

    await page.goto(`${admin()}/`);
    await expect(page.getByText(USER.email)).toBeVisible();
    const adminStore = await readableSecrets(page);
    expect(adminStore.cookie).toBe('');
    const adminTokens = adminStore.keys.filter((k) => TOKEN_KEY.test(k));
    expect(adminTokens.some((k) => k.endsWith('.idToken'))).toBe(true);
    expect(
      adminTokens.every((k) => k.includes(`.${E2E_COGNITO.adminClientId}.`)),
    ).toBe(true);

    // The public site shares the host here (only the port differs), so a
    // token cookie from either app would show up in its document.cookie.
    for (const path of ['/', '/posts', '/admin']) {
      await page.goto(`${publicSite()}${path}`);
      const publicStore = await readableSecrets(page);
      expect(publicStore.cookie).not.toMatch(
        /CognitoIdentityServiceProvider|eyJ/,
      );
      expect(publicStore.keys.filter((k) => TOKEN_KEY.test(k))).toEqual([]);
      expect(publicStore.values).not.toMatch(/eyJ/);
    }
  });

  test('after the managed-login session ends, the second app takes exactly one prompt', async ({
    page,
  }) => {
    await page.goto(`${admin()}/`);
    await signInThroughPrompt(page, login);
    await expect(page.getByText(USER.email)).toBeVisible();

    login.session = false;
    await page.goto(`${notebook()}/notes`);
    await signInThroughPrompt(page, login);
    await expect(page).toHaveURL(`${notebook()}/notes?area=work`);
    await expect(page.getByRole('button', { name: 'New page' })).toBeVisible();
    expect(login.prompts).toBe(2);

    // Each app keeps its own refresh token, so neither asks again.
    await page.goto(`${admin()}/home`);
    await expect(page.getByText(USER.email)).toBeVisible();
    await page.goto(`${notebook()}/today`);
    await expect(
      page.getByRole('button', { name: 'Jump to today' }),
    ).toBeVisible();
    expect(login.prompts).toBe(2);
    expect(login.authorizes).toHaveLength(2);
  });

  test("signing out of one app revokes only that app's token", async ({
    page,
  }) => {
    await page.goto(`${notebook()}/`);
    await signInThroughPrompt(page, login);
    await expect(page).toHaveURL(`${notebook()}/today?area=work`);
    await page.goto(`${admin()}/`);
    await expect(page.getByText(USER.email)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(login.revoked).toEqual([E2E_COGNITO.adminClientId]);
    expect(login.logouts).toEqual([
      { clientId: E2E_COGNITO.adminClientId, logoutUri: `${admin()}/` },
    ]);
    expect(login.globalSignOuts).toBe(0);

    const authorizesBefore = login.authorizes.length;
    await page.goto(`${notebook()}/tasks`);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    expect(login.authorizes).toHaveLength(authorizesBefore);
  });
});

test('the Notebook host serves an installable manifest scoped to its root', async ({
  request,
}) => {
  const manifest = await (
    await request.get(`${notebook()}/manifest.json`)
  ).json();
  expect(manifest).toMatchObject({
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(`${notebook()}${icon.src}`)).status()).toBe(200);
  }

  const notebookShell = await (await request.get(`${notebook()}/today`)).text();
  expect(notebookShell).toContain('<link rel="manifest" href="/manifest.json"');
  const adminShell = await (await request.get(`${admin()}/`)).text();
  expect(adminShell).not.toContain('rel="manifest"');
});
