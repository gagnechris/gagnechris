import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

const sidebarToggle = (page: Page) =>
  page.getByRole('button', { name: 'Sidebar' });
const sidebarNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Notebook' });
const sidebarWidth = async (page: Page) =>
  Math.round(
    (await page.locator('.workspace-sidebar').boundingBox())?.width ?? 0,
  );

test('the date-row toggle and ⌘\\ in the editor hide the sidebar, leaving no rail and the area switch in the date row', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/today?area=work`);
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  const dayNav = page.locator('.notebook-today__day-nav');
  const areaSelect = dayNav.getByRole('combobox', { name: 'Notebook area' });
  const toggle = sidebarToggle(page);
  await expect(dayNav.locator(':scope > *').first()).toHaveAccessibleName(
    'Sidebar',
  );
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebarNav(page)).toBeVisible();
  await expect(areaSelect).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebarNav(page)).toBeHidden();
  await expect(page.locator('.workspace-main')).toHaveJSProperty(
    'offsetLeft',
    0,
  );
  const atLeftEdge = await page.evaluate(() =>
    document
      .elementFromPoint(4, window.innerHeight / 2)
      ?.closest('.workspace-main, .workspace-sidebar')
      ?.className.includes('workspace-main'),
  );
  expect(atLeftEdge).toBe(true);
  await expect(areaSelect).toBeVisible();
  await areaSelect.selectOption('personal');
  await expect(page).toHaveURL(/area=personal/);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(sidebarNav(page)).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(editor).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(sidebarNav(page)).toBeHidden();
  await expect(editor).toBeFocused();
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
    const y = box.y + box.height / 2;
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

test('every Notebook page has the toggle; Admin keeps its sidebar', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  for (const path of ['/upcoming', '/notes', '/tasks', '/settings/templates']) {
    await page.goto(`${apps.notebook}${path}?area=work`);
    await expect(sidebarToggle(page)).toBeVisible();
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
