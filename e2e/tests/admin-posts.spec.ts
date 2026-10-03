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
