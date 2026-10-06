import { expect, test } from '../fixtures';

test('a Notebook-only user opening Admin sees No access instead of the app', async ({
  page,
  apps,
  users,
  signIn,
}) => {
  await signIn({ ...users.owner, groups: ['notebook'] });
  await page.goto(`${apps.admin}/projects`);
  await expect(
    page.getByRole('heading', { name: 'You don’t have access to Admin' }),
  ).toBeVisible();
  await expect(page.getByText('Notebook only')).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Go to Notebook' }),
  ).toHaveAttribute('href', `${apps.notebook}/`);
});

test('a Public CMS user opening Notebook is sent to Admin', async ({
  page,
  apps,
  users,
  signIn,
}) => {
  await signIn({ ...users.owner, groups: ['site-admin'] });
  await page.goto(`${apps.notebook}/`);
  await expect(
    page.getByRole('heading', { name: 'You don’t have access to Notebook' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Go to Admin' }).click();
  await expect(page).toHaveURL(`${apps.admin}/`);
  await expect(page.getByRole('link', { name: 'Posts' }).first()).toBeVisible();
});
