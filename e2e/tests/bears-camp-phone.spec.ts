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

const openCamp = async (page: Page, url: string) => {
  await page.clock.install({ time: EVENING });
  await page.goto(url);
  // Hold the clock so the evening only moves when the test says so.
  await page.clock.pauseAt(new Date(EVENING.getTime() + 1_000));
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
      const card = page.getByRole('dialog');
      await expect(card).toBeVisible();
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
