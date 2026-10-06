import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

const CAMP = '/dont-feed-the-bears/camp';
const EVENING = new Date(2026, 9, 4, 18, 0);

// Replaces Web Share and the clipboard with recorders, so the test can see
// what was sent without a system sheet or clipboard permission.
const stubShareAndClipboard = (page: Page, { share }: { share: boolean }) =>
  page.addInitScript((share) => {
    const w = window as unknown as { shared: unknown[]; copied: string[] };
    w.shared = [];
    w.copied = [];
    const proto = Navigator.prototype as unknown as Record<string, unknown>;
    if (share) {
      Object.defineProperty(proto, 'share', {
        configurable: true,
        value: async (data: unknown) => {
          w.shared.push(data);
        },
      });
      Object.defineProperty(proto, 'canShare', {
        configurable: true,
        value: () => true,
      });
    } else {
      delete proto.share;
      delete proto.canShare;
    }
    Object.defineProperty(proto, 'clipboard', {
      configurable: true,
      get: () => ({
        writeText: async (text: string) => {
          w.copied.push(text);
        },
      }),
    });
  }, share);

const recorded = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { shared: unknown[]; copied: string[] };
    return { shared: w.shared, copied: w.copied };
  });

const noHorizontalScroll = async (page: Page) => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

/**
 * Each element sits inside the viewport and `.camp`, and nothing clips it:
 * hit tests at its corners and at its first glyph land on the element.
 * Overflow and clip-path clipping both stop hit tests, so a clipped corner
 * or letter fails here even when the box itself is in place.
 */
const expectUnclipped = async (page: Page, selectors: readonly string[]) => {
  for (const selector of selectors) {
    const problems = await page.evaluate((selector) => {
      const el = document.querySelector(selector)!;
      const found: string[] = [];
      const lands = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit));
      };
      // Scroll the edge being probed into view; the element may be taller
      // than the screen.
      const rectAt = (block: ScrollLogicalPosition) => {
        el.scrollIntoView({ block });
        return el.getBoundingClientRect();
      };
      const camp = () =>
        document.querySelector('.camp')!.getBoundingClientRect();

      const r = rectAt('start');
      if (r.left < 0 || r.right > window.innerWidth) found.push('viewport');
      if (r.left < camp().left || r.right > camp().right) found.push('.camp');

      // A rounded corner of the element's own border doesn't count, so step
      // in past its radius (the arc crosses the diagonal at 0.3r).
      const style = getComputedStyle(el);
      const inset = (radius: string) => Math.ceil(0.3 * parseFloat(radius)) + 1;
      const corners = [
        ['top-left', 'start', style.borderTopLeftRadius, 1, 1],
        ['top-right', 'start', style.borderTopRightRadius, -1, 1],
        ['bottom-left', 'end', style.borderBottomLeftRadius, 1, -1],
        ['bottom-right', 'end', style.borderBottomRightRadius, -1, -1],
      ] as const;
      for (const [name, block, radius, dx, dy] of corners) {
        const b = rectAt(block);
        const d = inset(radius);
        const x = dx > 0 ? b.left + d : b.right - d;
        const y = dy > 0 ? b.top + d : b.bottom - d;
        if (!lands(x, y)) found.push(name);
      }

      rectAt('start');
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const start = text.textContent!.search(/\S/);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + 1);
        const g = range.getBoundingClientRect();
        // Text hidden on phones has an empty box; the first shown glyph counts.
        if (g.width === 0) continue;
        if (g.left < camp().left || g.left < 0) found.push('first glyph box');
        if (!lands(g.left + 0.5, g.top + 0.5)) found.push('first glyph');
        break;
      }
      return found;
    }, selector);
    expect(problems, `${selector} clipped`).toEqual([]);
  }
};

const openCamp = async (page: Page, url: string) => {
  await page.clock.install({ time: EVENING });
  await page.goto(url);
  // Hold the clock so the evening only moves when the test says so. The
  // page load runs on real time first, so pause well after it.
  await page.clock.pauseAt(new Date(EVENING.getTime() + 5 * 60_000));
  await expect(
    page.getByRole('button', { name: 'Start the evening' }),
  ).toBeVisible();
};

for (const width of [375, 393]) {
  test.describe(`Camp Rules on a ${width}px phone`, () => {
    test.use({ viewport: { width, height: 852 }, hasTouch: true });

    test('plays one-handed with 72px targets and no horizontal scroll', async ({
      page,
      apps,
    }) => {
      await stubShareAndClipboard(page, { share: true });
      await openCamp(page, apps.public + CAMP);
      await noHorizontalScroll(page);
      await expect(page.getByText('Daily camp · Oct 4')).toBeVisible();

      const field = await page.locator('.camp-field').boundingBox();
      expect(field!.height).toBeGreaterThan(field!.width);

      const stats = page.locator('.camp-hud__stat');
      await expect(stats).toHaveCount(4);
      const tops = await stats.evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().top)),
      );
      expect(new Set(tops).size).toBe(1);
      await expect(
        page.locator('.camp-hud').getByText('Snacks', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.camp-hud__count')).toHaveText('0/3');
      await expectUnclipped(page, ['.camp-hud', '.camp-start']);

      await page.getByRole('button', { name: 'Start the evening' }).tap();

      const items = page.locator('.camp-item');
      await expect(items).toHaveCount(5);
      for (const box of await items.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
      )) {
        expect(box.width).toBeGreaterThanOrEqual(72);
        expect(box.height).toBeGreaterThanOrEqual(72);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }

      const out = page.getByRole('button', { name: /, out\. Activate/ });
      const startedOut = await out.count();
      expect(startedOut).toBeGreaterThan(0);
      await out.first().tap();
      await expect(out).toHaveCount(startedOut - 1);
      await expectUnclipped(page, ['.camp-hud', '.camp-hud__short']);

      await page.clock.runFor(3_000);
      const bear = page.getByRole('button', { name: /^Bear heading for/ });
      await expect(bear.first()).toBeVisible();
      const bearBox = await bear.first().boundingBox();
      expect(bearBox!.width).toBeGreaterThanOrEqual(72);
      expect(bearBox!.height).toBeGreaterThanOrEqual(72);
      await bear.first().tap();
      await expect(page.getByRole('status')).toHaveText(
        'You made some noise. The bear wanders off.',
      );
      await noHorizontalScroll(page);

      await page.clock.runFor(60_000);
      const card = page.getByRole('region');
      await expect(card).toBeVisible();
      await expect(card.getByRole('heading', { level: 2 })).toBeFocused();
      await expect(page.locator('.camp-hud')).toBeHidden();
      await expect(
        card.getByText(/^\d+s · \d+ saves? · score \d+$/),
      ).toBeVisible();
      await expect(
        card.getByRole('link', { name: 'Vermont Fish & Wildlife source' }),
      ).toBeVisible();
      for (const name of ['Play again', 'Share result']) {
        const box = await card.getByRole('button', { name }).boundingBox();
        expect(box!.height, name).toBeGreaterThanOrEqual(44);
      }
      await expectUnclipped(page, [
        '.bears-end',
        '.bears-end__kicker',
        '.bears-end__title',
        '.bears-end__tip',
        '.bears-end__actions',
        '.bears-end__back',
      ]);
      await noHorizontalScroll(page);
    });

    test('Share result opens the share sheet with the summary', async ({
      page,
      apps,
    }) => {
      await stubShareAndClipboard(page, { share: true });
      await openCamp(page, apps.public + CAMP);
      await page.getByRole('button', { name: 'Start the evening' }).tap();
      await page.clock.runFor(61_000);

      await page.getByRole('button', { name: 'Share result' }).tap();

      await expect
        .poll(async () => (await recorded(page)).shared)
        .toEqual([
          {
            title: 'Camp Rules',
            text: expect.stringMatching(
              /^Camp Rules · Oct 4 · held \d+s, \d+ saves?$/,
            ),
            url: 'https://gagnechris.com/dont-feed-the-bears/camp',
          },
        ]);
      expect((await recorded(page)).copied).toEqual([]);
    });

    test('without Web Share, the result is copied', async ({ page, apps }) => {
      await stubShareAndClipboard(page, { share: false });
      await openCamp(page, apps.public + CAMP);
      await page.getByRole('button', { name: 'Start the evening' }).tap();
      await page.clock.runFor(61_000);

      await page.getByRole('button', { name: 'Copy result' }).tap();

      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect((await recorded(page)).copied).toEqual([
        expect.stringMatching(/^Camp Rules 2026-10-04: /),
      ]);
    });
  });
}

test.describe('Camp Rules on desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('copies the result even where the browser can share', async ({
    page,
    apps,
  }) => {
    await stubShareAndClipboard(page, { share: true });
    await openCamp(page, apps.public + CAMP);
    await expect(page.getByText('Daily camp · Oct 4')).toBeHidden();
    await page.getByRole('button', { name: 'Start the evening' }).click();
    await page.clock.runFor(61_000);

    await expect(
      page.getByRole('button', { name: 'Share result' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Copy result' }).click();

    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
    expect(await recorded(page)).toEqual({
      shared: [],
      copied: [expect.stringMatching(/^Camp Rules 2026-10-04: /)],
    });
  });
});
