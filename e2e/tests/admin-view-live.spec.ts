import type { Locator, Page } from '@playwright/test';
import { expect, requireEnv, test } from '../fixtures';

// The stack builds the admin app with the local site as its public origin.
const site = () => requireEnv('E2E_SITE_URL');

const expectPublicLink = async (link: Locator, path: string) => {
  await expect(link).toHaveAttribute('href', `${site()}${path}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
};

const expectPreviewImagesFromSite = async (page: Page) => {
  const images = page.locator('.admin-editor-split__preview img');
  await expect(images.first()).toBeVisible();
  for (const image of await images.all()) {
    const src = await image.getAttribute('src');
    expect(new URL(src ?? '', page.url()).origin).toBe(new URL(site()).origin);
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }
};

test('View live in every admin editor opens the public site', async ({
  page,
  apps,
  signIn,
  prefix,
  seed,
}) => {
  const post = await seed.publishedPost({ title: `${prefix} live post` });
  const project = await seed.publishedProject({
    name: `${prefix} live project`,
    slug: `${prefix}-live-project`,
    bodyMarkdown: 'Live.',
  });

  await signIn();
  const viewLive = page.getByRole('link', { name: 'View live' });

  await page.goto(`${apps.admin}/posts/${post.id}`);
  await expectPublicLink(viewLive, `/posts/${post.slug}`);
  const [livePost] = await Promise.all([
    page.waitForEvent('popup'),
    viewLive.click(),
  ]);
  await expect(livePost).toHaveURL(`${site()}/posts/${post.slug}`);
  await expect(
    livePost.getByRole('heading', { level: 1, name: post.title }),
  ).toBeVisible();
  await livePost.close();

  await page.goto(`${apps.admin}/projects/${project.id}`);
  await expectPublicLink(viewLive, `/projects/${project.slug}`);

  await page.goto(`${apps.admin}/home`);
  await expectPublicLink(viewLive, '/');

  await page.goto(`${apps.admin}/resume`);
  await expectPublicLink(viewLive, '/resume');
});

test('Home and Resume previews load their images from the public site', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  for (const path of ['/home', '/resume']) {
    await page.goto(`${apps.admin}${path}`);
    await expectPreviewImagesFromSite(page);
  }
});
