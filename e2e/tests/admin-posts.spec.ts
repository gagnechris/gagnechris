import { expect, test } from '../fixtures';

test('signed-in admin sees the Posts list', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const post = await seed.post();
  await signIn();
  await page.goto(apps.admin);

  await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
  await expect(page.getByRole('link', { name: post.title })).toBeVisible();
  await expect(page.getByText(seed.user.label)).toBeVisible();
});

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('the post body is one pane: an inserted image shows inline and survives reload, and Preview renders the post', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const post = await seed.post({ bodyMarkdown: '## Intro\n\nHello there.' });
  await signIn();
  await page.goto(`${apps.admin}/posts/${post.id}`);
  const editor = page.locator('.markdown-editor');
  await expect(page.getByRole('tab', { name: 'Split' })).toHaveCount(0);

  await editor.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(editor.locator('.cm-md-h2')).toHaveText('Intro');
  await page.getByLabel('Insert image').setInputFiles({
    name: 'chart.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  const image = editor.locator('img.cm-md-image');
  await expect(image).toHaveAttribute('alt', 'chart');
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);

  await page.keyboard.press('ControlOrMeta+S');
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/admin/posts/{id}', {
        params: { path: { id: post.id } },
      });
      return data?.bodyMarkdown;
    })
    .toMatch(/!\[chart\]\(\/media\/.+\.png\)/);

  await page.reload();
  await expect(editor.locator('img.cm-md-image')).toHaveAttribute(
    'alt',
    'chart',
  );

  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.getByRole('heading', { name: 'Intro' })).toBeVisible();
  await expect(preview.getByRole('img', { name: 'chart' })).toBeVisible();
  await expect(editor).toBeHidden();
});
