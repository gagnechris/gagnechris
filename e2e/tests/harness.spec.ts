import { expect, test } from '../fixtures';

test('signs two users in side by side with separate data', async ({
  page,
  apps,
  signIn,
  pageAs,
  users,
  seed,
  seedAs,
}) => {
  const mine = await seed.note();
  const theirs = await seedAs(users.other).note();

  await signIn(users.owner);
  await page.goto(`${apps.notebook}/notes`);
  const otherPage = await pageAs(users.other);
  await otherPage.goto(`${apps.notebook}/notes`);

  await expect(page.getByText(users.owner.label)).toBeVisible();
  await expect(otherPage.getByText(users.other.label)).toBeVisible();

  const { data } = await seed.api.GET('/api/notebook/notes');
  const ids = data?.items.map((n) => n.id);
  expect(ids).toContain(mine.id);
  expect(ids).not.toContain(theirs.id);
});
