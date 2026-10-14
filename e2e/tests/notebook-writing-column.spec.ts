import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const DAY = '2026-11-12';
const MORNING = new Date('2026-11-12T09:00:00-05:00');
const LONG_LINE = Array.from(
  { length: 12 },
  () => 'A sentence long enough to wrap the note across the column.',
).join(' ');

const COLUMN_MAX = 720;
const COLUMN_MIN = 480;

async function openToday(
  page: Page,
  notebook: string,
  width: number,
  prefix: string,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(MORNING);
  await page.goto(`${notebook}/today`);
  await expect(page.locator('.cm-content')).toContainText(prefix);
}

/** The writing column (its box less the centring padding) and the space it sits in. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('.notebook-column')!;
    const box = main.getBoundingClientRect();
    const s = getComputedStyle(main);
    const left = box.left + parseFloat(s.paddingLeft);
    const right = box.right - parseFloat(s.paddingRight);
    const rect = (sel: string) =>
      document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const line = document.querySelector('.cm-line')!;
    return {
      cell: { left: box.left, right: box.right, width: box.width },
      column: { left, right, width: right - left },
      lineWidth: line.getBoundingClientRect().width,
      sidebar: rect('.workspace-sidebar')?.width ?? 0,
      side: rect('#notebook-today-side')?.width ?? 0,
    };
  });

const leftEdges = (page: Page) =>
  page.evaluate(() => {
    const textLeft = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.textContent?.trim()) node = walker.nextNode();
      const range = document.createRange();
      range.selectNodeContents(node!);
      return range.getBoundingClientRect().left;
    };
    return {
      date: textLeft(document.querySelector('.notebook-today__kicker')!),
      title: textLeft(document.querySelector('.notebook-today__title h1')!),
      note: textLeft(document.querySelector('.cm-line')!),
    };
  });

/** Closes the task panel and waits out its slide. */
async function hideTasks(page: Page) {
  await page.getByRole('button', { name: /^Tasks/, expanded: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.notebook-today')!.getAnimations().length === 0,
  );
}

test.beforeEach(async ({ seed, signIn, apps, page, prefix }) => {
  await seed.daily(DAY, `${prefix} ${LONG_LINE}`);
  await signIn();
  await page.goto(apps.notebook);
});

test('at 1440px with the task panel closed, note lines stay within 720px and centred', async ({
  page,
  apps,
  prefix,
}) => {
  await openToday(page, apps.notebook, 1440, prefix);
  await hideTasks(page);
  const { cell, column, lineWidth } = await layout(page);
  expect(column.width).toBeCloseTo(COLUMN_MAX, 0);
  expect(lineWidth).toBeLessThanOrEqual(COLUMN_MAX);
  expect(column.left - cell.left).toBeGreaterThan(40);
  expect(column.left - cell.left).toBeCloseTo(cell.right - column.right, 0);
});

test('at 1280px closing the task panel widens the note up to its maximum', async ({
  page,
  apps,
  prefix,
}) => {
  await openToday(page, apps.notebook, 1280, prefix);
  const open = await layout(page);
  expect(open.column.width).toBeLessThan(COLUMN_MAX - 100);
  await hideTasks(page);
  await expect
    .poll(async () => (await layout(page)).column.width)
    .toBeCloseTo(COLUMN_MAX, 0);
  expect((await layout(page)).lineWidth).toBeLessThanOrEqual(COLUMN_MAX);
});

test('the date row, title and note text share one left edge', async ({
  page,
  apps,
  prefix,
}) => {
  await openToday(page, apps.notebook, 1440, prefix);
  for (const open of [true, false]) {
    if (!open) await hideTasks(page);
    const { date, title, note } = await leftEdges(page);
    const { column } = await layout(page);
    expect(Math.abs(date - column.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(title - column.left)).toBeLessThanOrEqual(4);
    expect(Math.abs(note - column.left)).toBeLessThanOrEqual(2);
  }
});

test('at 1280px dragging either panel wider stops when the note reaches 480px', async ({
  page,
  apps,
  prefix,
}) => {
  await openToday(page, apps.notebook, 1280, prefix);
  const drag = async (name: string, dx: number) => {
    const box = (await page.getByRole('separator', { name }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 200;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 20 });
    await page.mouse.up();
  };

  const atMinimum = async () => {
    const { cell } = await layout(page);
    expect(cell.width).toBeGreaterThanOrEqual(COLUMN_MIN - 1);
    expect(cell.width).toBeLessThanOrEqual(COLUMN_MIN + 16);
  };

  await drag('Resize sidebar', 500);
  await atMinimum();
  expect((await layout(page)).sidebar).toBeLessThan(400);
  await page.getByRole('separator', { name: 'Resize sidebar' }).dblclick();

  await drag('Resize task panel', -500);
  await atMinimum();
  expect((await layout(page)).side).toBeLessThan(576);
});

test('a smaller window holds remembered panel widths back, and a wider one restores them', async ({
  page,
  apps,
  prefix,
}) => {
  await page.evaluate(() => {
    localStorage.setItem('gagnechris.notebook.todaySideWidth', '576');
    localStorage.setItem('gagnechris.notebook.sidebarWidth', '400');
  });
  await openToday(page, apps.notebook, 1600, prefix);
  const wide = await layout(page);
  expect([wide.sidebar, wide.side]).toEqual([400, 576]);

  await page.setViewportSize({ width: 1100, height: 900 });
  const narrow = await layout(page);
  expect(narrow.cell.width).toBeGreaterThanOrEqual(COLUMN_MIN - 1);
  expect(narrow.side).toBeLessThan(576);
  expect(narrow.sidebar).toBeLessThan(400);

  await page.setViewportSize({ width: 1600, height: 900 });
  const back = await layout(page);
  expect([back.sidebar, back.side]).toEqual([400, 576]);
});
