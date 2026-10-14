import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({
  timezoneId: 'America/New_York',
  viewport: { width: 1440, height: 900 },
});

const DAY = '2026-11-18';
const MORNING = new Date(`${DAY}T09:00:00-05:00`);

const tasksToggle = (page: Page) =>
  page.getByRole('button', { name: /^Tasks/ });
const side = (page: Page) => page.locator('#notebook-today-side');

async function openToday(
  page: Page,
  signIn: () => Promise<unknown>,
  url: string,
) {
  await page.clock.setFixedTime(MORNING);
  await signIn();
  await page.goto(`${url}/today`);
  await expect(page.locator('.markdown-editor .cm-content')).toBeVisible();
  await expect(
    page.getByTestId('still-open').getByText('Loading tasks…'),
  ).toHaveCount(0);
}

const sideWidth = (page: Page) =>
  side(page).evaluate((el) => el.getBoundingClientRect().width);

test('the Tasks toggle sits on the sticky title row, counts Still open and leaves nothing on the right when hidden', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await seed.task({ title: `${prefix} one`, startDate: DAY });
  await seed.task({ title: `${prefix} two`, startDate: DAY });
  const lines = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}`);
  await seed.daily(DAY, lines.join('\n\n'));
  await openToday(page, signIn, apps.notebook);

  const toggle = tasksToggle(page);
  await expect(
    page.locator('.workspace-action-bar').getByRole('button', {
      name: /^Tasks/,
    }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const stillOpenCount = await page
    .getByTestId('still-open')
    .locator('[data-task-id]')
    .count();
  expect(stillOpenCount).toBeGreaterThanOrEqual(2);
  await expect(toggle).toHaveAccessibleName(
    `Tasks ${stillOpenCount} still open`,
  );
  await expect(toggle.locator('.notebook-today__side-count')).toHaveText(
    `${stillOpenCount} still open`,
  );

  await page
    .locator('.cm-content')
    .getByText('Line 1', { exact: true })
    .click();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(
    page.locator('.cm-content').getByText('Line 120'),
  ).toBeInViewport();
  await expect(page.getByText('Line 1', { exact: true })).not.toBeInViewport();
  await expect(toggle).toBeInViewport();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveText(/^Tasks/);
  await expect(toggle).toBeInViewport();
  await expect.poll(() => sideWidth(page)).toBe(0);
  await expect(side(page)).toBeHidden();
  const edges = await page.evaluate(() => {
    const grid = document.querySelector('.notebook-today')!;
    const main = document.querySelector('.notebook-today__main')!;
    return {
      grid: grid.getBoundingClientRect().right,
      main: main.getBoundingClientRect().right,
      children: [...grid.children].map((c) => c.className),
    };
  });
  expect(edges.main).toBeCloseTo(edges.grid, 0);
  expect(edges.children).toEqual([
    'notebook-today__main notebook-column',
    'notebook-today__side',
  ]);
});

test('a mouse click leaves no focus ring on the Tasks toggle; Tab shows one', async ({
  page,
  apps,
  signIn,
}) => {
  await openToday(page, signIn, apps.notebook);
  const toggle = tasksToggle(page);
  const outline = () =>
    toggle.evaluate((el) => getComputedStyle(el).outlineStyle);

  await toggle.click();
  await expect(toggle).toBeFocused();
  expect(await outline()).toBe('none');
  await toggle.click();

  await page.getByRole('button', { name: 'Note options' }).focus();
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  expect(await outline()).not.toBe('none');
});

test('⌥⌘\\ opens and closes the task panel from inside the editor', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  await seed.daily(DAY, 'Standup notes');
  await openToday(page, signIn, apps.notebook);
  const editor = page.locator('.cm-content');
  await editor.getByText('Standup notes').click();
  const toggle = tasksToggle(page);

  await page.keyboard.press('ControlOrMeta+Alt+Backslash');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => sideWidth(page)).toBe(0);
  await expect(editor).toBeFocused();

  await page.keyboard.press('ControlOrMeta+Alt+Backslash');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(side(page)).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Standup notes');
  await expect(toggle).toHaveAttribute('title', /⌥⌘\\/);
});

test('the carry-over line ends the task panel, not the note', async ({
  page,
  apps,
  signIn,
}) => {
  await openToday(page, signIn, apps.notebook);
  const carry = page.getByTestId('carry-footer');
  await expect(carry).toBeVisible();
  await expect(
    page.locator('.notebook-today__main [data-testid="carry-footer"]'),
  ).toHaveCount(0);
  expect(
    await side(page).evaluate(
      (el) => el.lastElementChild?.getAttribute('data-testid') ?? null,
    ),
  ).toBe('carry-footer');
});

/** Toggles the panel and lists the transitions it starts on the layout. */
const toggleAndReadTransitions = (page: Page) =>
  page.evaluate(async () => {
    const grid = document.querySelector('.notebook-today')!;
    const panel = document.querySelector('#notebook-today-side')!;
    document
      .querySelector<HTMLButtonElement>('.notebook-today__side-toggle')!
      .click();
    await new Promise(requestAnimationFrame);
    return [...grid.getAnimations(), ...panel.getAnimations()].map((a) => ({
      property: (a as CSSTransition).transitionProperty,
      duration: Number(a.effect?.getTiming().duration),
    }));
  });

test('the task panel slides open and closed', async ({
  page,
  apps,
  signIn,
}) => {
  await openToday(page, signIn, apps.notebook);
  for (const expanded of ['false', 'true']) {
    const running = await toggleAndReadTransitions(page);
    await expect(tasksToggle(page)).toHaveAttribute('aria-expanded', expanded);
    const slide = running.find((t) => t.property === 'grid-template-columns');
    expect(slide?.duration).toBeGreaterThanOrEqual(150);
    expect(slide?.duration).toBeLessThanOrEqual(200);
    await page.waitForFunction(
      () =>
        document.querySelector('.notebook-today')!.getAnimations().length === 0,
    );
  }
});

test('with reduced motion the task panel opens and closes without animation', async ({
  page,
  apps,
  signIn,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openToday(page, signIn, apps.notebook);
  for (const expanded of ['false', 'true']) {
    expect(await toggleAndReadTransitions(page)).toEqual([]);
    await expect(tasksToggle(page)).toHaveAttribute('aria-expanded', expanded);
    expect(await sideWidth(page)).toBe(expanded === 'true' ? 352 : 0);
  }
});

test.describe('at 1000px', () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  const noteWidth = (page: Page) =>
    page
      .locator('.notebook-today__main')
      .evaluate((el) => el.getBoundingClientRect().width);
  const settled = (page: Page) =>
    page.waitForFunction(
      () =>
        document.querySelector('#notebook-today-side')!.getAnimations()
          .length === 0,
    );

  test('Today opens with the panel closed, and opening it covers the note without changing the note’s width', async ({
    page,
    apps,
    signIn,
    seed,
    prefix,
  }) => {
    await seed.task({ title: `${prefix} overlay`, startDate: DAY });
    await openToday(page, signIn, apps.notebook);
    const toggle = tasksToggle(page);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(side(page)).toBeHidden();
    const before = await noteWidth(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(side(page)).toBeVisible();
    await settled(page);
    expect(await noteWidth(page)).toBe(before);
    await expect(page.locator('.notebook-today__scrim')).toBeVisible();
    await expect(
      page.getByRole('separator', { name: 'Resize task panel' }),
    ).toHaveCount(0);
    const covered = await page.evaluate(() => {
      const note = document
        .querySelector('.notebook-today__main')!
        .getBoundingClientRect();
      const panel = document
        .querySelector('#notebook-today-side')!
        .getBoundingClientRect();
      const x = (panel.left + Math.min(panel.right, note.right)) / 2;
      const y = (panel.top + panel.bottom) / 2;
      return {
        overlaps: panel.left < note.right - 100,
        inViewport: panel.right <= window.innerWidth,
        topmost: Boolean(
          document.elementFromPoint(x, y)?.closest('#notebook-today-side'),
        ),
      };
    });
    expect(covered).toEqual({
      overlaps: true,
      inViewport: true,
      topmost: true,
    });
    await expect(
      side(page).getByText(`${prefix} overlay`, { exact: true }),
    ).toBeVisible();
  });

  test('Esc closes the overlay and focus returns to the Tasks toggle', async ({
    page,
    apps,
    signIn,
    seed,
  }) => {
    await seed.daily(DAY, 'Standup notes');
    await openToday(page, signIn, apps.notebook);
    const toggle = tasksToggle(page);

    await toggle.click();
    await expect(side(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await expect(side(page)).toBeHidden();
    await expect(page.locator('.notebook-today__scrim')).toHaveCount(0);

    await page.locator('.cm-content').getByText('Standup notes').click();
    await page.keyboard.press('ControlOrMeta+Alt+Backslash');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(side(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();

    await toggle.click();
    await settled(page);
    await page
      .locator('.notebook-today__scrim')
      .click({ position: { x: 20, y: 400 } });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('widening the window past 1100px restores the side-by-side panel at its remembered width and state', async ({
    page,
    apps,
    signIn,
  }) => {
    await openToday(page, signIn, apps.notebook);
    await page.evaluate(() => {
      localStorage.setItem('gagnechris.notebook.todaySideWidth', '300');
      localStorage.setItem('gagnechris.notebook.todaySide', 'closed');
    });
    await page.reload();
    await expect(page.locator('.cm-content')).toBeVisible();
    const toggle = tasksToggle(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.notebook-today__scrim')).toHaveCount(0);
    await expect.poll(() => sideWidth(page)).toBe(0);

    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(
      await page.evaluate(() => ({
        open: localStorage.getItem('gagnechris.notebook.todaySide'),
        width: localStorage.getItem('gagnechris.notebook.todaySideWidth'),
      })),
    ).toEqual({ open: 'closed', width: '300' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => sideWidth(page)).toBe(300);
    const placed = await page.evaluate(() => ({
      note: document
        .querySelector('.notebook-today__main')!
        .getBoundingClientRect().right,
      panel: document
        .querySelector('#notebook-today-side')!
        .getBoundingClientRect().left,
      position: getComputedStyle(
        document.querySelector('#notebook-today-side')!,
      ).position,
    }));
    expect(placed.note).toBeLessThanOrEqual(placed.panel);
    expect(placed.position).toBe('relative');
    await expect(
      page.getByRole('separator', { name: 'Resize task panel' }),
    ).toBeVisible();

    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => sideWidth(page)).toBe(300);
  });

  test('with reduced motion the overlay opens and closes without animation', async ({
    page,
    apps,
    signIn,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openToday(page, signIn, apps.notebook);
    for (const expanded of ['true', 'false']) {
      expect(await toggleAndReadTransitions(page)).toEqual([]);
      await expect(tasksToggle(page)).toHaveAttribute(
        'aria-expanded',
        expanded,
      );
    }
  });

  test('the overlay slides in from the right', async ({
    page,
    apps,
    signIn,
  }) => {
    await openToday(page, signIn, apps.notebook);
    const running = await toggleAndReadTransitions(page);
    const slide = running.find((t) => t.property === 'transform');
    expect(slide?.duration).toBe(180);
  });
});

test('at 767px the strip and sheet behave as before', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await seed.task({ title: `${prefix} phone`, startDate: DAY });
  await openToday(page, signIn, apps.notebook);
  await expect(tasksToggle(page)).toBeHidden();
  await expect(side(page)).toBeHidden();

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Alt+Backslash');
  await expect(side(page)).toBeHidden();
  await expect(page.locator('.notebook-today__scrim')).toHaveCount(0);

  const strip = page.getByRole('button', { name: /still open, .* Show list/ });
  await strip.click();
  const sheet = page.getByRole('dialog', { name: 'Today’s tasks' });
  await expect(sheet.getByText(`${prefix} phone`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(strip).toBeFocused();
});
