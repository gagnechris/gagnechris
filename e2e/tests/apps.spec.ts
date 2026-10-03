import { expect, test } from '../fixtures';

test('the admin app serves the CMS from its own root, without Notebook', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(apps.admin);
  const nav = page.getByRole('navigation', { name: 'Admin' });
  await expect(nav.getByRole('link', { name: 'Posts' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(nav.getByRole('link', { name: 'Resume' })).toHaveAttribute(
    'href',
    '/resume',
  );
  await expect(nav.getByRole('link', { name: 'Notebook' })).toHaveCount(0);

  await page.goto(`${apps.admin}/today`);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

test('the Notebook app opens on Today and deep-links to its own pages', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const note = await seed.note({ title: 'Deep link target' });
  await signIn();

  await page.goto(apps.notebook);
  await expect(page).toHaveURL(`${apps.notebook}/today`);
  await expect(
    page.getByRole('button', { name: 'Jump to today' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Notebook', exact: true }),
  ).toBeVisible();

  await page.goto(`${apps.notebook}/notes`);
  await page.getByRole('link', { name: 'Deep link target' }).click();
  await expect(page).toHaveURL(`${apps.notebook}/notes/${note.id}`);

  await page.goto(`${apps.notebook}/posts`);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

test('the public site has no admin, Notebook or sign-in pages', async ({
  page,
  apps,
}) => {
  for (const path of [
    '/admin',
    '/admin/notebook/today',
    '/auth/callback',
    '/today',
  ]) {
    await page.goto(`${apps.public}${path}`);
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
  }
});
