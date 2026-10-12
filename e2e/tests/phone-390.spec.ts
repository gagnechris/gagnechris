import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

const expectNoOverflow = async (page: Page) => {
  expect(
    await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]),
  ).toEqual([390, 390]);
};

const expectFullWidthTabBar = async (page: Page) => {
  const nav = page.locator('nav.workspace-nav');
  await expect(nav).toBeVisible();
  expect((await nav.boundingBox())?.width).toBe(390);
  // Labels overlap once items shrink below their text.
  const widths = await nav
    .locator('.workspace-nav__item:visible')
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().width),
    );
  expect(widths.length).toBeGreaterThan(1);
  for (const width of widths) expect(width).toBeGreaterThan(60);
};

test.describe('admin and Notebook routes at 390px', () => {
  test.beforeEach(async ({ page, signIn }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn();
  });

  const sweep = async (page: Page, base: string, paths: string[]) => {
    for (const path of paths) {
      await test.step(path, async () => {
        await page.goto(new URL(path, base).href);
        await expect(page.locator('main').first()).toBeVisible();
        // Measure the loaded screen, not a loading state.
        await page.waitForLoadState('networkidle');
        await expectNoOverflow(page);
        await expectFullWidthTabBar(page);
      });
    }
  };

  test('every admin route fits and keeps a full-width tab bar', async ({
    page,
    apps,
    seed,
  }) => {
    const post = await seed.post({ title: 'A draft post title for a phone' });
    // Default names and slugs are long unbroken words, as real slugs can be.
    const project = await seed.project();
    await sweep(page, apps.admin, [
      '/',
      '/posts',
      `/posts/${post.id}`,
      '/projects',
      `/projects/${project.id}`,
      '/pages',
      '/home',
      '/resume',
      '/settings/users',
    ]);
  });

  test('every Notebook route fits and keeps a full-width tab bar', async ({
    page,
    apps,
    seed,
  }) => {
    const note = await seed.note({ title: 'Phone note', bodyMarkdown: 'Hi' });
    const task = await seed.task({ title: 'Phone task', noteId: note.id });
    await sweep(page, apps.notebook, [
      '/',
      '/today',
      '/upcoming',
      '/notes',
      `/notes/${note.id}`,
      '/tasks',
      `/tasks/${task.id}`,
      '/settings/templates',
    ]);
  });
});

test.describe('admin phone layout at 390px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('Users & access fits the screen and its drawer opens fully on-screen', async ({
    page,
    apps,
    prefix,
    signIn,
  }) => {
    const name = `Phone ${prefix}`;
    await signIn();
    await page.goto(`${apps.admin}/settings/users`);
    await page.getByRole('button', { name: 'Invite user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invite user' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Email').fill(`${prefix}-phone@e2e.test`);
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expectNoOverflow(page);
    await expectFullWidthTabBar(page);

    await page.getByRole('button', { name: `Edit access for ${name}` }).click();
    const drawer = page.getByRole('dialog', {
      name: `Edit access for ${name}`,
    });
    await expect(drawer).toBeVisible();
    const box = (await drawer.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expectNoOverflow(page);
  });

  test('the post editor keeps the full-width tab bar', async ({
    page,
    apps,
    signIn,
    seed,
  }) => {
    const post = await seed.post({ bodyMarkdown: 'Hello.' });
    await signIn();
    await page.goto(`${apps.admin}/posts/${post.id}`);
    await expect(page.locator('.markdown-editor')).toBeVisible();
    await expectNoOverflow(page);
    await expectFullWidthTabBar(page);
  });
});
