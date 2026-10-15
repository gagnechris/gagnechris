import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test('on a phone, a post is published and unpublished from its row', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const post = await seed.post();
  await signIn();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(apps.admin);

  const row = page.getByRole('row').filter({ hasText: post.title });
  await expect(row.getByText('Draft')).toBeVisible();
  const menu = row.getByRole('button', { name: `Actions for ${post.title}` });
  const box = (await menu.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  // On a phone the row menu opens as a bottom sheet.
  await menu.click();
  await page.getByRole('menuitem', { name: 'Publish' }).click();
  await expect(row.getByText('Published')).toBeVisible();

  await menu.click();
  await page.getByRole('menuitem', { name: 'Unpublish' }).click();
  await expect(row.getByText('Draft')).toBeVisible();

  // The title link covers the whole row.
  await row.click({ position: { x: 20, y: 60 } });
  await expect(page).toHaveURL(new RegExp(`/posts/${post.id}$`));
});

test('on a phone, a user row opens Edit access', async ({
  page,
  apps,
  prefix,
  signIn,
}) => {
  const name = `Row ${prefix}`;
  await signIn();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`${apps.admin}/settings/users`);
  await page.getByRole('button', { name: 'Invite user' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite user' });
  await invite.getByLabel('Name').fill(name);
  await invite.getByLabel('Email').fill(`${prefix}-row@e2e.test`);
  await invite.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(invite).toBeHidden();

  await page.getByRole('row').getByText(`${prefix}-row@e2e.test`).click();
  await expect(
    page.getByRole('dialog', { name: `Edit access for ${name}` }),
  ).toBeVisible();
});

for (const width of [375, 393]) {
  test(`Posts and Users have no sideways scroll at ${width}px`, async ({
    page,
    apps,
    prefix,
    signIn,
    seed,
  }) => {
    await seed.post({ slug: `${prefix}-a-very-long-unbroken-slug-for-phones` });
    await signIn();
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/settings/users']) {
      await page.goto(`${apps.admin}${path}`);
      await expect(page.getByRole('row').nth(1)).toBeVisible();
      expect(await scrollsSideways(page), path).toBe(false);
    }
  });
}
