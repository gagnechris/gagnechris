import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const DAY = '2026-11-12';
const MORNING = new Date('2026-11-12T09:00:00-05:00');
const LONG_LINE = Array.from(
  { length: 12 },
  () => 'A sentence long enough to wrap the note across the column.',
).join(' ');

const COLUMN_MIN = 480;
// .workspace-main side padding, and --today-side-gap less the panel's inset.
const PAGE_PADDING = 40;
const WHITE = [255, 255, 255];
// --neutral-50
const CHROME = [249, 250, 251];

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

/** The writing column and what sits either side of it. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const rect = (sel: string) =>
      document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const box = rect('.notebook-column')!;
    const main = rect('.workspace-main')!;
    const sidebar = rect('.workspace-sidebar');
    const side = rect('#notebook-today-side');
    return {
      cell: { left: box.left, right: box.right, width: box.width },
      main: { left: main.left, right: main.right },
      lineWidth: rect('.cm-line')!.width,
      sidebar: sidebar?.width ?? 0,
      sidebarRight: sidebar && sidebar.width > 0 ? sidebar.right : 0,
      side: side?.width ?? 0,
      sideLeft: side?.left ?? 0,
    };
  });

/** The painted colour at a viewport point, read from a 1px screenshot. */
async function pixel(page: Page, x: number, y: number) {
  const png = await page.screenshot({
    clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
    animations: 'disabled',
  });
  const channels = png[25] === 6 ? 4 : 3;
  let idat = Buffer.alloc(0);
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') {
      idat = Buffer.concat([idat, png.subarray(at + 8, at + 8 + length)]);
    }
    at += length + 12;
  }
  // One pixel in one row: every PNG filter leaves the bytes as they are.
  return [...inflateSync(idat).subarray(1, 1 + channels)].slice(0, 3);
}

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

test('at 1440px with the task panel and sidebar closed, the note spans the page between its side padding', async ({
  page,
  apps,
  prefix,
}) => {
  await openToday(page, apps.notebook, 1440, prefix);
  await hideTasks(page);
  await page.getByRole('button', { name: 'Sidebar' }).click();
  await expect(page.getByRole('navigation', { name: 'Notebook' })).toBeHidden();
  await expect
    .poll(async () => (await layout(page)).main.left)
    .toBeCloseTo(0, 0);

  const { cell, main, lineWidth } = await layout(page);
  expect(main.right).toBeCloseTo(1440, 0);
  expect(cell.left - main.left).toBeCloseTo(PAGE_PADDING, 0);
  expect(main.right - cell.right).toBeCloseTo(PAGE_PADDING, 0);
  expect(cell.width).toBeCloseTo(1440 - 2 * PAGE_PADDING, 0);
  expect(lineWidth).toBeGreaterThan(cell.width - 40);
});

test('a collapsed sidebar with a remembered width hides all of it on a small window', async ({
  page,
  apps,
  prefix,
}) => {
  await page.evaluate(() => {
    localStorage.setItem('gagnechris.notebook.sidebarWidth', '400');
    localStorage.setItem('gagnechris.notebook.sidebar', 'closed');
  });
  await openToday(page, apps.notebook, 1100, prefix);
  const main = page.locator('.workspace-main');
  await expect.poll(async () => (await main.boundingBox())?.x).toBe(0);
  const { cell } = await layout(page);
  expect(cell.width).toBeGreaterThanOrEqual(COLUMN_MIN);
});

test('at 1280px with both panels open the note fills the space between them, and closing the task panel widens it', async ({
  page,
  apps,
  prefix,
}) => {
  await openToday(page, apps.notebook, 1280, prefix);
  const open = await layout(page);
  expect(open.sidebar).toBeGreaterThan(0);
  expect(open.side).toBeGreaterThan(0);
  expect(open.cell.left - open.sidebarRight).toBeCloseTo(PAGE_PADDING, 0);
  // The panel's own inset sits between the white padding and its cards.
  expect(open.sideLeft - open.cell.right).toBeCloseTo(PAGE_PADDING + 16, 0);
  expect(open.lineWidth).toBeGreaterThan(open.cell.width - 40);

  await hideTasks(page);
  const closed = await layout(page);
  expect(closed.main.right - closed.cell.right).toBeCloseTo(PAGE_PADDING, 0);
  expect(closed.lineWidth).toBeGreaterThan(open.lineWidth + open.side);
});

test('the writing area is white, and the sidebar and task panel stay on the chrome colour', async ({
  page,
  apps,
  prefix,
}) => {
  await openToday(page, apps.notebook, 1280, prefix);
  const { cell, sidebarRight, sideLeft, side } = await layout(page);
  const bottom = 880;

  expect(await pixel(page, sidebarRight + 8, bottom)).toEqual(WHITE);
  expect(await pixel(page, cell.left + cell.width / 2, bottom)).toEqual(WHITE);
  expect(await pixel(page, cell.right + 8, bottom)).toEqual(WHITE);
  // The sticky day header covers the note with the same white.
  await expect(page.locator('.notebook-today__header')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );

  expect(await pixel(page, sidebarRight - 10, bottom)).toEqual(CHROME);
  // The panel's inset from the top of the page to the bottom, and past the
  // panel to the window edge.
  expect(await pixel(page, sideLeft - 8, 4)).toEqual(CHROME);
  expect(await pixel(page, sideLeft - 8, bottom)).toEqual(CHROME);
  expect(await pixel(page, 1275, bottom)).toEqual(CHROME);
  expect(side).toBeGreaterThan(0);
});

test('a page note is white and fills the page between the sidebar and the window edge', async ({
  page,
  apps,
  seed,
  prefix,
}) => {
  const note = await seed.note({
    title: `${prefix} page`,
    bodyMarkdown: `${prefix} ${LONG_LINE}`,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  await expect(page.locator('.cm-content')).toContainText(prefix);

  const { cell, main, sidebarRight, lineWidth } = await layout(page);
  expect(cell.left - sidebarRight).toBeCloseTo(PAGE_PADDING, 0);
  expect(main.right).toBeCloseTo(1440, 0);
  expect(main.right - cell.right).toBeCloseTo(PAGE_PADDING, 0);
  expect(lineWidth).toBeGreaterThan(cell.width - 40);
  expect(await pixel(page, cell.left + cell.width / 2, 880)).toEqual(WHITE);
  expect(await pixel(page, sidebarRight - 10, 880)).toEqual(CHROME);
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
    const { cell } = await layout(page);
    expect(Math.abs(date - cell.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(title - cell.left)).toBeLessThanOrEqual(4);
    expect(Math.abs(note - cell.left)).toBeLessThanOrEqual(2);
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
