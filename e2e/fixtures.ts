import { randomBytes } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { createApiClient, type ApiClient } from '@gagnechris/api-client';
import { ulid } from 'ulid';

/** Mirrors `LOCAL_AUTH_USER_KEY` in apps/web/src/workspace/auth/session.ts. */
const LOCAL_AUTH_USER_KEY = 'gagnechris.localAuthUser';

export type E2EUser = { userId: string; label: string };

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is unset; run via playwright.config.ts`);
  return value;
}

/** Seeds through the local API so data passes the same validation as the UI. */
export class Seed {
  readonly api: ApiClient;

  constructor(
    readonly user: E2EUser,
    private readonly prefix: string,
  ) {
    this.api = createApiClient({
      baseUrl: requireEnv('E2E_API_URL'),
      getToken: async () => `local:${user.userId}`,
    });
  }

  async post(input: { title?: string; bodyMarkdown?: string } = {}) {
    const suffix = randomBytes(3).toString('hex');
    const { data, error } = await this.api.POST('/api/admin/posts', {
      body: {
        title: input.title ?? `${this.prefix} post ${suffix}`,
        slug: `${this.prefix}-${suffix}`,
        bodyMarkdown: input.bodyMarkdown ?? 'Seeded by e2e.',
      },
    });
    if (!data) throw new Error(`seed post failed: ${JSON.stringify(error)}`);
    return data;
  }

  async note(input: { title?: string; bodyMarkdown?: string } = {}) {
    const { data, error } = await this.api.POST('/api/notebook/notes', {
      body: {
        id: ulid(),
        area: 'work',
        type: 'page',
        title: input.title ?? `${this.prefix} note`,
        bodyMarkdown: input.bodyMarkdown ?? '',
      },
    });
    if (!data) throw new Error(`seed note failed: ${JSON.stringify(error)}`);
    return data;
  }
}

/** Each app runs on its own origin, as in prod. */
export type AppUrls = { public: string; admin: string; notebook: string };

type Fixtures = {
  apps: AppUrls;
  /** Unique per test: prefix slugs and titles with it to stay isolated. */
  prefix: string;
  /** Two distinct admins for owner-isolation checks. */
  users: { owner: E2EUser; other: E2EUser };
  /** Signs `page` in as a user (default `users.owner`) before navigation. */
  signIn: (user?: E2EUser) => Promise<void>;
  /** A separate signed-in page for another user, closed after the test. */
  pageAs: (user: E2EUser) => Promise<Page>;
  seed: Seed;
  seedAs: (user: E2EUser) => Seed;
};

const authInit = ({ key, user }: { key: string; user: E2EUser }) => {
  window.localStorage.setItem(key, JSON.stringify(user));
};

// Playwright requires a destructured first argument even when unused.
/* eslint-disable no-empty-pattern */
export const test = base.extend<Fixtures>({
  apps: async ({}, use) => {
    await use({
      public: requireEnv('E2E_PUBLIC_URL'),
      admin: requireEnv('E2E_ADMIN_URL'),
      notebook: requireEnv('E2E_NOTEBOOK_URL'),
    });
  },
  prefix: async ({}, use) => {
    await use(`e2e-${randomBytes(4).toString('hex')}`);
  },
  users: async ({ prefix }, use) => {
    await use({
      owner: { userId: `${prefix}-owner`, label: `${prefix}-owner@e2e.test` },
      other: { userId: `${prefix}-other`, label: `${prefix}-other@e2e.test` },
    });
  },
  signIn: async ({ page, users }, use) => {
    await use(async (user = users.owner) => {
      await page
        .context()
        .addInitScript(authInit, { key: LOCAL_AUTH_USER_KEY, user });
    });
  },
  pageAs: async ({ browser }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (user) => {
      const context = await browser.newContext();
      contexts.push(context);
      await context.addInitScript(authInit, { key: LOCAL_AUTH_USER_KEY, user });
      return context.newPage();
    });
    await Promise.all(contexts.map((c) => c.close()));
  },
  seed: async ({ users, prefix }, use) => {
    await use(new Seed(users.owner, prefix));
  },
  seedAs: async ({ prefix }, use) => {
    await use((user) => new Seed(user, prefix));
  },
});
/* eslint-enable no-empty-pattern */

export { expect };
