import type { Page } from '@playwright/test';
import { expect, requireEnv, test } from '../fixtures';

// The local site serves the publisher's output, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const acceptDialogs = (page: Page) =>
  page.on('dialog', (dialog) => void dialog.accept());

const saved = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();

// Not a Save click: autosave can land first, and then Save is rightly
// disabled. The shortcut saves whatever is still pending, or nothing.
const saveNow = (page: Page) => page.keyboard.press('ControlOrMeta+S');

test('create, edit, upload a preview, publish, unpublish and delete a project', async ({
  page,
  apps,
  signIn,
  prefix,
  request,
  seed,
}) => {
  acceptDialogs(page);
  await signIn();
  await page.goto(`${apps.admin}/projects`);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);
  const id = new URL(page.url()).pathname.split('/').pop()!;

  const name = `${prefix} Side Quest`;
  const slug = `${prefix}-side-quest`;
  await page.getByLabel('Name', { exact: true }).fill(name);
  await expect(page.getByLabel(/^Slug/)).toHaveValue(slug);
  await page.getByLabel(/^Pitch/).fill('A small thing I am building.');
  await page.getByRole('radio', { name: 'Building' }).check();
  await page.getByLabel('Stack', { exact: true }).fill('React');
  await page.getByLabel('Stack', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel(/^Label/).fill('Repo');
  await page.getByLabel(/^URL/).fill('https://github.com/x');
  await page.getByRole('textbox', { name: 'Markdown' }).fill('## Why\n\nFun.');

  await page.getByLabel('Upload preview image').setInputFiles({
    name: 'preview.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  const preview = page.getByRole('img', { name: 'Preview image' });
  await expect(preview).toHaveAttribute('src', /^\/media\/.+\.png$/);
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);

  await saveNow(page);
  await saved(page);
  const { data: stored } = await seed.api.GET('/api/admin/projects/{id}', {
    params: { path: { id } },
  });
  expect(stored).toMatchObject({
    name,
    slug,
    stage: 'building',
    stack: ['React'],
    links: [{ label: 'Repo', url: 'https://github.com/x' }],
    bodyMarkdown: '## Why\n\nFun.',
    previewImage: expect.stringMatching(/^\/media\/.+\.png$/),
  });

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();
  await expect
    .poll(async () =>
      (await request.get(`${site()}/projects/${slug}`)).status(),
    )
    .toBe(200);
  expect(
    await (await request.get(`${site()}/projects/${slug}`)).text(),
  ).toContain(name);

  await page.getByRole('button', { name: 'Unpublish' }).click();
  await expect(
    page.getByRole('button', { name: 'Publish', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await request.get(`${site()}/projects/${slug}`)).status(),
    )
    .toBe(404);

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(
    0,
  );
});

test('a taken slug shows the slug-taken message', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const taken = `${prefix}-taken`;
  const { data, error } = await seed.api.POST('/api/admin/projects', {
    body: {
      name: `${prefix} taken`,
      slug: taken,
      pitch: '',
      stage: 'idea',
      stageNote: '',
      bodyMarkdown: '',
      stack: [],
      links: [],
      order: 0,
    },
  });
  if (!data) throw new Error(`seed project failed: ${JSON.stringify(error)}`);

  await signIn();
  await page.goto(`${apps.admin}/projects`);
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);

  await page.getByLabel(/^Slug/).fill(taken);
  await saveNow(page);
  await expect(
    page.getByText('That slug is already taken. Choose a different slug.'),
  ).toBeVisible();
  await expect(page.getByText(/Reload and try again/)).toHaveCount(0);
});

test('a demo with no preview image blocks Publish until an image is added', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
  request,
}) => {
  const slug = `${prefix}-demo`;
  const { data: created, error } = await seed.api.POST('/api/admin/projects', {
    body: {
      name: `${prefix} Demo`,
      slug,
      stage: 'building',
      bodyMarkdown: 'Try it.',
      demo: 'notebook',
    },
  });
  if (!created)
    throw new Error(`seed project failed: ${JSON.stringify(error)}`);

  const rejected = await seed.api.POST('/api/admin/projects/{id}/publish', {
    params: { path: { id: created.id } },
    body: { version: created.version },
  });
  expect(rejected.response.status).toBe(400);
  expect(rejected.error).toMatchObject({
    error: 'bad_request',
    fields: { previewImage: 'required_with_demo' },
  });

  await signIn();
  await page.goto(`${apps.admin}/projects/${created.id}`);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    `${prefix} Demo`,
  );
  const hint = page.getByText(
    'Add a preview image: a project with a demo needs one to publish.',
  );
  await expect(hint).toBeVisible();

  const blocked = page.getByText(
    'Not published: fix the highlighted fields first.',
  );
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(blocked).toBeVisible();
  await page.getByRole('heading', { name: 'Body' }).click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.waitForTimeout(500);
  const { data: stillDraft } = await seed.api.GET('/api/admin/projects/{id}', {
    params: { path: { id: created.id } },
  });
  expect(stillDraft).toMatchObject({ status: 'draft', version: 1 });

  await page.getByLabel('Upload preview image').setInputFiles({
    name: 'preview.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await expect(
    page.getByRole('img', { name: 'Preview image' }),
  ).toHaveAttribute('src', /^\/media\/.+\.png$/);
  await expect(hint).toHaveCount(0);
  await expect(blocked).toHaveCount(0);

  await page.getByRole('heading', { name: 'Body' }).click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();
  await expect
    .poll(async () =>
      (await request.get(`${site()}/projects/${slug}`)).status(),
    )
    .toBe(200);
});
