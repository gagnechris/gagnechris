import { randomBytes } from 'node:crypto';
import {
  test as base,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  createApiClient,
  type ApiClient,
  type paths,
} from '@gagnechris/api-client';
import { ulid } from 'ulid';

/** Mirrors `LOCAL_AUTH_USER_KEY` in apps/web/src/workspace/auth/session.ts. */
const LOCAL_AUTH_USER_KEY = 'gagnechris.localAuthUser';

export type E2EUser = {
  userId: string;
  label: string;
  /** Cognito groups; local auth defaults to all three. */
  groups?: string[];
};

/** Google Analytics hosts; no e2e build loads GA, so any request to one is a leak. */
export const GA_HOST = /(?:^|\.)(?:googletagmanager|google-analytics)\.com$/;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is unset; run via playwright.config.ts`);
  return value;
}

/**
 * Focuses the last tabbable element before `target`, so one Tab reaches
 * `target` or what follows it. Indexes list every test's items, so tabbing
 * from the top of the page takes an unbounded number of presses.
 */
export async function focusJustBefore(target: Locator): Promise<void> {
  await target.evaluate((el) => {
    const before = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]',
      ),
    ].filter(
      (t) =>
        t.tabIndex >= 0 &&
        t.getClientRects().length > 0 &&
        !t.contains(el) &&
        el.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING,
    );
    const last = before.at(-1);
    if (last) last.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  });
}

type JsonBody<
  P extends keyof paths,
  M extends 'post' | 'put',
> = paths[P][M] extends {
  requestBody?: { content: { 'application/json': infer B } };
}
  ? B
  : never;

export type PostInput = Partial<JsonBody<'/api/admin/posts', 'post'>>;
export type ProjectInput = Partial<JsonBody<'/api/admin/projects', 'post'>>;
type TaskInput = JsonBody<'/api/notebook/tasks', 'post'>;
type Area = JsonBody<'/api/notebook/tasks', 'post'>['area'];

const fail = (what: string, error: unknown): never => {
  throw new Error(`seed ${what} failed: ${JSON.stringify(error)}`);
};

/** Resolves after `count` animation frames, once the page has painted what it queued. */
export const afterFrames = (page: Page, count = 2): Promise<void> =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number) =>
          left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(n);
      }),
    count,
  );

/** Seeds through the local API so data passes the same validation as the UI. */
export class Seed {
  readonly api: ApiClient;

  constructor(
    readonly user: E2EUser,
    private readonly prefix: string,
    baseUrl = requireEnv('E2E_API_URL'),
  ) {
    this.api = createApiClient({
      baseUrl,
      getToken: async () => `local:${user.userId}`,
    });
  }

  /** A draft post; title and slug default to unique values under `prefix`. */
  async post(input: PostInput = {}) {
    const suffix = randomBytes(3).toString('hex');
    const { data, error } = await this.api.POST('/api/admin/posts', {
      body: {
        title: `${this.prefix} post ${suffix}`,
        slug: `${this.prefix}-${suffix}`,
        bodyMarkdown: 'Seeded by e2e.',
        ...input,
      },
    });
    return data ?? fail('post', error);
  }

  /** Created and published; resolves once the publisher has written the page. */
  async publishedPost(input: PostInput = {}) {
    const post = await this.post(input);
    const { data, error } = await this.api.POST(
      '/api/admin/posts/{id}/publish',
      { params: { path: { id: post.id } }, body: { version: post.version } },
    );
    return data?.status === 'published' ? data : fail('post publish', error);
  }

  /** A draft project in `building`; name and slug default to unique values. */
  async project(input: ProjectInput = {}) {
    const suffix = randomBytes(3).toString('hex');
    const { data, error } = await this.api.POST('/api/admin/projects', {
      body: {
        name: `${this.prefix} project ${suffix}`,
        slug: `${this.prefix}-${suffix}`,
        stage: 'building',
        ...input,
      },
    });
    return data ?? fail('project', error);
  }

  async publishedProject(input: ProjectInput = {}) {
    const project = await this.project(input);
    const { data, error } = await this.api.POST(
      '/api/admin/projects/{id}/publish',
      {
        params: { path: { id: project.id } },
        body: { version: project.version },
      },
    );
    return data?.status === 'published' ? data : fail('project publish', error);
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
    return data ?? fail('note', error);
  }

  /** The daily note for `date` (`yyyy-mm-dd`), created or replaced. */
  async daily(
    date: string,
    bodyMarkdown: string,
    opts: { area?: Area; id?: string; version?: number } = {},
  ) {
    const { data, error } = await this.api.PUT(
      '/api/notebook/notes/daily/{area}/{date}',
      {
        params: { path: { area: opts.area ?? 'work', date } },
        body: { id: opts.id ?? ulid(), version: opts.version, bodyMarkdown },
      },
    );
    return data ?? fail('daily note', error);
  }

  /** Replaces the area's daily template; `''` starts new days blank. */
  async dailyTemplate(area: Area, bodyMarkdown: string) {
    const path = { params: { path: { area } } };
    const current = await this.api.GET(
      '/api/notebook/templates/daily/{area}',
      path,
    );
    const { data, error } = await this.api.PUT(
      '/api/notebook/templates/daily/{area}',
      {
        ...path,
        body: {
          version: current.data?.version ?? fail('template', current.error),
          bodyMarkdown,
        },
      },
    );
    return data ?? fail('template', error);
  }

  /** New days in both areas start empty, as tests typing into a day expect. */
  async blankDailyTemplates() {
    await this.dailyTemplate('work', '');
    await this.dailyTemplate('personal', '');
  }

  async task(input: Partial<TaskInput> & { title: string }) {
    const { data, error } = await this.api.POST('/api/notebook/tasks', {
      body: { id: ulid(), area: 'work', noteId: null, ...input },
    });
    return data ?? fail('task', error);
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
