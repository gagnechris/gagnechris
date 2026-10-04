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

test('create, edit, upload a preview, publish, unpublish and delete a project', async ({
  page,
  apps,
  signIn,
  prefix,
  request,
}) => {
  acceptDialogs(page);
  await signIn();
  await page.goto(`${apps.admin}/projects`);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9A-Z]{26}$/);

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

  await page.getByRole('button', { name: 'Save' }).click();
  await saved(page);

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
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByText('That slug is already taken. Choose a different slug.'),
  ).toBeVisible();
  await expect(page.getByText(/Reload and try again/)).toHaveCount(0);
});
