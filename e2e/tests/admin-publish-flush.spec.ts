import type { Page } from '@playwright/test';
import { expect, test, type Seed } from '../fixtures';

type Logged = {
  method: string;
  path: string;
  body: unknown;
  start: number;
  end: number;
};

declare global {
  interface Window {
    __writes?: Logged[];
  }
}

// Chromium does not report bodies sent as a Request object, so record them
// in the page.
const recordWrites = (page: Page) =>
  page.addInitScript(() => {
    const writes: Logged[] = [];
    window.__writes = writes;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const req = new Request(input, init);
      if (req.method !== 'PUT' && req.method !== 'POST') return original(req);
      const text = await req.clone().text();
      const start = performance.now();
      const res = await original(req);
      writes.push({
        method: req.method,
        path: new URL(req.url).pathname,
        body: text ? (JSON.parse(text) as unknown) : null,
        start,
        end: performance.now(),
      });
      return res;
    };
  });

const writesTo = async (page: Page, id: string) =>
  (await page.evaluate(() => window.__writes ?? [])).filter((entry) =>
    entry.path.includes(id),
  );

const slowPuts = (page: Page, ms: number) =>
  page.route('**/api/admin/**', async (route) => {
    if (route.request().method() === 'PUT')
      await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });

/** Every PUT finished before Publish was sent; returns the last PUT body. */
const lastPutBeforePublish = async (page: Page, id: string) => {
  const log = await writesTo(page, id);
  const publish = log.find((entry) => entry.path.endsWith('/publish'));
  const puts = log.filter((entry) => entry.method === 'PUT');
  expect(publish).toBeDefined();
  expect(puts.length).toBeGreaterThan(0);
  for (const put of puts) expect(put.end).toBeLessThanOrEqual(publish!.start);
  return puts.at(-1)!.body as Record<string, unknown>;
};

const publishButton = (page: Page) =>
  page.getByRole('button', { name: 'Publish', exact: true });

async function seedProject(seed: Seed, prefix: string) {
  const { data } = await seed.api.POST('/api/admin/projects', {
    body: {
      name: `${prefix} Tag target`,
      slug: `${prefix}-tag-target`,
      stage: 'building',
      bodyMarkdown: 'Body.',
    },
  });
  if (!data) throw new Error('seed project failed');
  return data;
}

for (const via of ['button', 'shortcut'] as const) {
  test(`posts: tick a project, then Publish (${via}) at once; the published post has the tag`, async ({
    page,
    apps,
    signIn,
    seed,
    prefix,
  }) => {
    const project = await seedProject(seed, prefix);
    const post = await seed.post();

    await recordWrites(page);
    await signIn();
    await page.goto(`${apps.admin}/posts/${post.id}`);
    await page.getByText('Details', { exact: true }).click();
    const box = page
      .getByRole('group', { name: 'Part of project' })
      .getByRole('checkbox', { name: `${project.name} · Building` });
    await box.check();
    if (via === 'button') await publishButton(page).click();
    else await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

    expect(await lastPutBeforePublish(page, post.id)).toMatchObject({
      projectIds: [project.id],
    });
    const { data: stored } = await seed.api.GET('/api/admin/posts/{id}', {
      params: { path: { id: post.id } },
    });
    expect(stored).toMatchObject({
      status: 'published',
      hasUnpublishedChanges: false,
      projectIds: [project.id],
    });
  });
}

test('posts: tick a project, wait for Saved, then Publish; the published post has the tag', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const project = await seedProject(seed, prefix);
  const post = await seed.post();

  await signIn();
  await page.goto(`${apps.admin}/posts/${post.id}`);
  await page.getByText('Details', { exact: true }).click();
  await page
    .getByRole('group', { name: 'Part of project' })
    .getByRole('checkbox', { name: `${project.name} · Building` })
    .check();
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await publishButton(page).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  const { data: stored } = await seed.api.GET('/api/admin/posts/{id}', {
    params: { path: { id: post.id } },
  });
  expect(stored).toMatchObject({
    status: 'published',
    hasUnpublishedChanges: false,
    projectIds: [project.id],
  });
});

test('posts: edit the excerpt, then Publish at once; the published post has the edit', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const post = await seed.post();

  await recordWrites(page);
  await signIn();
  await page.goto(`${apps.admin}/posts/${post.id}`);
  await page.getByText('Details', { exact: true }).click();
  await page.getByLabel('Excerpt').fill('Written just before Publish.');
  await publishButton(page).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  expect(await lastPutBeforePublish(page, post.id)).toMatchObject({
    excerpt: 'Written just before Publish.',
  });
  const { data: stored } = await seed.api.GET('/api/admin/posts/{id}', {
    params: { path: { id: post.id } },
  });
  expect(stored).toMatchObject({
    status: 'published',
    hasUnpublishedChanges: false,
    excerpt: 'Written just before Publish.',
  });
});

test('posts: a project ticked while a save is in flight is in the published post', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const project = await seedProject(seed, prefix);
  const post = await seed.post();
  await slowPuts(page, 1_500);

  await recordWrites(page);
  await signIn();
  await page.goto(`${apps.admin}/posts/${post.id}`);
  await page.getByText('Details', { exact: true }).click();
  await page.getByLabel('Excerpt').fill('first');
  await page.keyboard.press('ControlOrMeta+S');
  await expect(
    page.getByRole('status').filter({ hasText: 'Saving' }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'Part of project' })
    .getByRole('checkbox', { name: `${project.name} · Building` })
    .check();
  await publishButton(page).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  expect(await lastPutBeforePublish(page, post.id)).toMatchObject({
    excerpt: 'first',
    projectIds: [project.id],
  });
  const { data: stored } = await seed.api.GET('/api/admin/posts/{id}', {
    params: { path: { id: post.id } },
  });
  expect(stored).toMatchObject({
    status: 'published',
    hasUnpublishedChanges: false,
    excerpt: 'first',
    projectIds: [project.id],
  });
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
});

test('projects: edit the pitch, then Publish at once; the published project has the edit', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const project = await seedProject(seed, prefix);

  await recordWrites(page);
  await signIn();
  await page.goto(`${apps.admin}/projects/${project.id}`);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    project.name,
  );
  await page.getByLabel(/^Pitch/).fill('Written just before Publish.');
  await publishButton(page).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  expect(await lastPutBeforePublish(page, project.id)).toMatchObject({
    pitch: 'Written just before Publish.',
  });
  const { data: stored } = await seed.api.GET('/api/admin/projects/{id}', {
    params: { path: { id: project.id } },
  });
  expect(stored).toMatchObject({
    status: 'published',
    hasUnpublishedChanges: false,
    pitch: 'Written just before Publish.',
  });
});

test('projects: an edit typed while a save is in flight is in the published project', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const project = await seedProject(seed, prefix);
  await slowPuts(page, 1_500);

  await recordWrites(page);
  await signIn();
  await page.goto(`${apps.admin}/projects/${project.id}`);
  const pitch = page.getByLabel(/^Pitch/);
  await pitch.fill('first');
  await page.keyboard.press('ControlOrMeta+S');
  await expect(
    page.getByRole('status').filter({ hasText: 'Saving' }),
  ).toBeVisible();
  await pitch.fill('first second');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  expect(await lastPutBeforePublish(page, project.id)).toMatchObject({
    pitch: 'first second',
  });
  const { data: stored } = await seed.api.GET('/api/admin/projects/{id}', {
    params: { path: { id: project.id } },
  });
  expect(stored).toMatchObject({
    status: 'published',
    hasUnpublishedChanges: false,
    pitch: 'first second',
  });
});
