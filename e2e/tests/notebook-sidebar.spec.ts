import type { Locator, Page } from '@playwright/test';
import { expect, pickArea, test } from '../fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

const sidebarToggle = (page: Page) =>
  page.getByRole('button', { name: 'Sidebar' });
const sidebarNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Notebook' });
const sidebarWidth = async (page: Page) =>
  Math.round(
    (await page.locator('.workspace-sidebar').boundingBox())?.width ?? 0,
  );

const opacity = (locator: Locator) =>
  locator.evaluate((el) => getComputedStyle(el).opacity);

test('hovering the sidebar edge shows a button that collapses it; the window edge brings it back at its width and takes no width while idle', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/today?area=work`);
  await page.evaluate(() =>
    localStorage.setItem('gagnechris.notebook.sidebarWidth', '280'),
  );
  await page.reload();
  await expect(page.locator('.cm-content')).toBeVisible();
  const dayNav = page.locator('.notebook-today__day-nav');
  const areaChip = dayNav.getByRole('button', { name: 'Area: Work' });
  await expect(
    page.locator('.workspace-main').getByRole('button', { name: 'Sidebar' }),
  ).toHaveCount(0);
  await expect(areaChip).toBeVisible();
  expect(await sidebarWidth(page)).toBe(280);

  const collapse = page
    .locator('.workspace-sidebar')
    .getByRole('button', { name: 'Sidebar' });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await expect(collapse).toHaveAttribute('title', 'Hide sidebar (⌘\\)');
  expect(await opacity(collapse)).toBe('0');
  const handle = page.getByRole('separator', { name: 'Resize sidebar' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await expect.poll(() => opacity(collapse)).toBe('1');
  const button = (await collapse.boundingBox())!;
  expect(
    Math.abs(button.x + button.width - (box.x + box.width)),
  ).toBeLessThanOrEqual(1);
  expect(button.y + button.height / 2).toBeCloseTo(
    page.viewportSize()!.height / 2,
    -1,
  );

  await collapse.click();
  await expect(sidebarNav(page)).toBeHidden();
  const expand = sidebarToggle(page);
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(expand).toBeFocused();
  await expect(expand).toHaveAttribute('title', 'Show sidebar (⌘\\)');
  await expect(page.locator('.workspace-main')).toHaveJSProperty(
    'offsetLeft',
    0,
  );
  const zone = page.locator('.ui-panel-edge-zone--left');
  expect(
    await zone.evaluate((el) => ({
      position: getComputedStyle(el).position,
      left: el.getBoundingClientRect().left,
      width: el.getBoundingClientRect().width,
    })),
  ).toEqual({ position: 'fixed', left: 0, width: 12 });
  await page.mouse.move(600, 300);
  await expect.poll(() => opacity(expand)).toBe('0');
  await expect(areaChip).toBeVisible();
  await pickArea(page, 'Personal');
  await expect(page).toHaveURL(/area=personal/);

  await page.mouse.move(4, 300);
  await expect.poll(() => opacity(expand)).toBe('1');
  await expand.click();
  await expect(sidebarNav(page)).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBe(280);
  await expect(collapse).toBeFocused();
  await expect(zone).toHaveCount(0);
});

test('⌘\\ in the editor hides and shows the sidebar and leaves focus in the editor', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/today?area=work`);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(sidebarNav(page)).toBeHidden();
  await expect(sidebarToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(editor).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(sidebarNav(page)).toBeVisible();
  await expect(sidebarToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(editor).toBeFocused();
});

test('the sidebar edge buttons work by keyboard and say whether it is expanded', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/today?area=work`);
  await page.getByRole('separator', { name: 'Resize sidebar' }).focus();
  await page.keyboard.press('Tab');
  const collapse = sidebarToggle(page);
  await expect(collapse).toBeFocused();
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => opacity(collapse)).toBe('1');

  await page.keyboard.press('Enter');
  await expect(sidebarNav(page)).toBeHidden();
  const expand = sidebarToggle(page);
  await expect(expand).toBeFocused();
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => opacity(expand)).toBe('1');

  await page.keyboard.press('Space');
  await expect(sidebarNav(page)).toBeVisible();
  await expect(sidebarToggle(page)).toBeFocused();
  await expect(sidebarToggle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('dragging the sidebar edge past its minimum collapses it, and a reload keeps it closed at its last width', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/today?area=work`);
  const handle = page.getByRole('separator', { name: 'Resize sidebar' });
  await expect(handle).toBeVisible();
  const before = await sidebarWidth(page);

  const drag = async (dx: number) => {
    const box = await handle.boundingBox();
    if (!box) throw new Error('no resize handle');
    const x = box.x + box.width / 2;
    // Clear of the collapse button in the middle of the edge.
    const y = box.y + 100;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };

  await drag(64);
  const widened = await sidebarWidth(page);
  expect(widened).toBeGreaterThan(before + 40);

  await page.reload();
  await expect(sidebarNav(page)).toBeVisible();
  expect(await sidebarWidth(page)).toBe(widened);

  await drag(-(widened + 40));
  await expect(sidebarNav(page)).toBeHidden();
  await expect(sidebarToggle(page)).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(sidebarNav(page)).toBeHidden();
  await expect(sidebarToggle(page)).toHaveAttribute('aria-expanded', 'false');

  await sidebarToggle(page).click();
  await expect(sidebarNav(page)).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBe(widened);
});

test('every Notebook page has the edge button and no header toggle; Admin keeps its sidebar', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  for (const path of ['/upcoming', '/notes', '/tasks', '/settings/templates']) {
    await page.goto(`${apps.notebook}${path}?area=work`);
    await expect(
      page.locator('.workspace-sidebar').getByRole('button', {
        name: 'Sidebar',
      }),
    ).toBeVisible();
    await expect(
      page.locator('.workspace-main').getByRole('button', { name: 'Sidebar' }),
    ).toHaveCount(0);
  }
  await sidebarToggle(page).click();
  await expect(sidebarNav(page)).toBeHidden();
  await page.goto(`${apps.notebook}/notes?area=work`);
  await expect(sidebarNav(page)).toBeHidden();

  await page.goto(apps.admin);
  const adminNav = page.getByRole('navigation', { name: 'Admin' });
  await expect(adminNav).toBeVisible();
  await expect(sidebarToggle(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(adminNav).toBeVisible();
});
