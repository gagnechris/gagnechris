import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { EVERY_MARKDOWN_ELEMENT } from '@gagnechris/shared/fixtures/every-markdown-element';
import { expect, requireEnv, test, type Seed } from '../fixtures';

async function publishFixturePost(seed: Seed, prefix: string): Promise<string> {
  const slug = `${prefix}-${randomBytes(3).toString('hex')}`;
  await seed.publishedPost({
    title: 'Every markdown element',
    slug,
    excerpt: 'A fixture post that uses every element the editor can produce.',
    bodyMarkdown: EVERY_MARKDOWN_ELEMENT,
  });
  return slug;
}

/** Records whether "Loading post" is ever on screen, from the first byte. */
const watchForLoading = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { sawLoading: boolean };
    w.sawLoading = false;
    new MutationObserver(() => {
      if (document.body?.textContent?.includes('Loading post')) {
        w.sawLoading = true;
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

test.describe('a published post', () => {
  let slug: string;

  test.beforeEach(async ({ seed, prefix, request }) => {
    slug = await publishFixturePost(seed, prefix);
    // Parallel tests rebuild the local site too; wait until the page is there.
    await expect
      .poll(async () => (await request.get(`${site()}/posts/${slug}`)).status())
      .toBe(200);
  });

  test('desktop: 60–80 characters a line, nested headings, underlined links', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await watchForLoading(page);
    await page.goto(`${site()}/posts/${slug}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Every markdown element' }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const lines = await page
      .locator('.post-content > p')
      .first()
      .evaluate((p) => {
        const top = p.getBoundingClientRect().top;
        const lineHeight = parseFloat(getComputedStyle(p).lineHeight);
        const counts: number[] = [];
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (let i = 0; i < node.textContent!.length; i += 1) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = range.getBoundingClientRect();
            if (!rect.height) continue;
            const line = Math.floor(
              (rect.top + rect.height / 2 - top) / lineHeight,
            );
            counts[line] = (counts[line] ?? 0) + 1;
          }
        }
        return counts;
      });
    const full = lines.slice(0, -1);
    expect(full.length).toBeGreaterThanOrEqual(2);
    const average = full.reduce((a, b) => a + b, 0) / full.length;
    expect(average).toBeGreaterThanOrEqual(60);
    expect(average).toBeLessThanOrEqual(80);

    const levels = await page
      .locator('#root')
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i], `heading ${i}`).toBeLessThanOrEqual(levels[i - 1] + 1);
    }

    for (const link of await page
      .locator('.post-content a, .post-author a')
      .all()) {
      const line = await link.evaluate(
        (el) => getComputedStyle(el).textDecorationLine,
      );
      expect(line).toContain('underline');
    }

    expect(
      await page.evaluate(
        () => (window as unknown as { sawLoading: boolean }).sawLoading,
      ),
    ).toBe(false);
  });

  test('390px: body at least 18px, no sideways scroll, wide blocks scroll in their box', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${site()}/posts/${slug}`);
    await expect(page.locator('.post-content')).toBeVisible();

    const size = await page
      .locator('.post-content > p')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(18);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    for (const selector of ['.post-content pre', '.post-content .post-table']) {
      const box = page.locator(selector).first();
      const { scrollable, tabIndex } = await box.evaluate((el) => ({
        scrollable: el.scrollWidth > el.clientWidth,
        tabIndex: (el as HTMLElement).tabIndex,
      }));
      expect(scrollable, selector).toBe(true);
      expect(tabIndex, selector).toBe(0);
    }
    await expect(page.getByRole('region', { name: 'Table 1' })).toBeVisible();
  });
});
