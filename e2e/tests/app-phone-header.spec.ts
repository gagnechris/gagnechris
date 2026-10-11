import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({ viewport: { width: 393, height: 852 } });

const box = async (locator: Locator) => (await locator.boundingBox())!;

async function expectLargeTitle(page: Page, name: string | RegExp) {
  const title = page.getByRole('heading', { level: 1, name });
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS('font-size', '32px');
  await expect(title).toHaveCSS('font-weight', '700');
  return title;
}

test('list pages put the action above a 32px title and hide eyebrows', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(apps.admin);
  const title = await expectLargeTitle(page, 'Posts');
  await expect(
    page.getByRole('main').getByText('Site', { exact: true }),
  ).toBeHidden();
  const newPost = page.getByRole('button', { name: 'New post' });
  expect((await box(newPost)).y).toBeLessThan((await box(title)).y);
  expect((await box(newPost)).height).toBeGreaterThanOrEqual(44);

  await page.goto(`${apps.admin}/settings/users`);
  await expectLargeTitle(page, 'Users & access');
  await expect(
    page.getByRole('main').getByText('Settings', { exact: true }),
  ).toBeHidden();

  for (const [path, name] of [
    ['/upcoming', 'Upcoming'],
    ['/tasks', 'Tasks'],
    ['/notes', 'Notes'],
  ] as const) {
    await page.goto(`${apps.notebook}${path}`);
    await expectLargeTitle(page, name);
  }
});

test('an editor has a 44px nav row with back, More actions and a Publish pill', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const post = await seed.post();
  await signIn();
  await page.goto(`${apps.admin}/posts/${post.id}`);

  const back = page.getByRole('link', { name: '← Posts' });
  const toggle = page.getByRole('button', { name: 'More actions' });
  const publish = page.getByRole('button', { name: 'Publish' });
  for (const control of [back, toggle, publish]) {
    expect((await box(control)).height).toBeGreaterThanOrEqual(44);
  }
  expect((await box(toggle)).width).toBeGreaterThanOrEqual(44);
  expect(
    Math.abs((await box(back)).y - (await box(publish)).y),
  ).toBeLessThanOrEqual(1);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveCSS(
    'font-size',
    '32px',
  );

  const save = page.getByRole('button', { name: 'Save' });
  const remove = page.getByRole('button', { name: 'Delete' });
  await expect(save).toBeHidden();
  await toggle.click();
  for (const action of [remove, save]) {
    await expect(action).toBeVisible();
    expect((await box(action)).height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  await expect(save).toBeHidden();

  await page.goto(`${apps.admin}/home`);
  await expect(page.getByRole('link', { name: '← Pages' })).toBeVisible();
  await expectLargeTitle(page, 'Home');
});

test('every action in the More sheet is a 44px row', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/notes`);
  await page.waitForLoadState('networkidle');
  await page
    .getByRole('navigation', { name: 'Notebook' })
    .getByRole('button', { name: 'More' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  const actions = sheet.locator('a, button');
  await expect(
    sheet.getByRole('button', { name: 'Sign out of Notebook' }),
  ).toContainText('Sign out');
  const heights = await actions.evaluateAll((els) =>
    els
      .filter((el) => el.checkVisibility())
      .map((el) => [
        el.textContent?.trim() || el.getAttribute('aria-label'),
        el.getBoundingClientRect().height,
      ]),
  );
  expect(heights.length).toBeGreaterThan(2);
  expect(heights.filter(([, height]) => (height as number) < 44)).toEqual([]);
});
