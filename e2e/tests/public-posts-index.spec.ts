import { randomBytes } from 'node:crypto';
import { formatPostShortDate } from '@gagnechris/shared';
import { expect, focusJustBefore, requireEnv, test } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

type ListItem = { slug: string; excerpt: string; publishedAt: string | null };

test.describe('the posts index', () => {
  let slug: string;

  test.beforeEach(async ({ seed, prefix, request }) => {
    slug = `${prefix}-${randomBytes(3).toString('hex')}`;
    const { data: created } = await seed.api.POST('/api/admin/posts', {
      body: {
        title: `Index entry ${slug}`,
        slug,
        excerpt: `Excerpt for ${slug}.`,
        bodyMarkdown: 'Body.',
      },
    });
    if (!created) throw new Error('seed post failed');
    const { data: published } = await seed.api.POST(
      '/api/admin/posts/{id}/publish',
      {
        params: { path: { id: created.id } },
        body: { version: created.version },
      },
    );
    if (published?.status !== 'published') throw new Error('publish failed');
    // Parallel tests rebuild the local site too; wait until the index has it.
    await expect
      .poll(async () => (await request.get(`${site()}/posts`)).text())
      .toContain(`href="/posts/${slug}"`);
  });

  test('lists every published post with its excerpt and date without JS', async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    // Other tests publish while this runs, so compare one consistent pair.
    await expect(async () => {
      const { items } = (await (
        await request.get(`${site()}/posts/posts.json`)
      ).json()) as { items: ListItem[] };
      await page.goto(`${site()}/posts`);
      expect(items.length).toBeGreaterThan(0);
      expect(await page.locator('li.post-preview').count()).toBe(items.length);
      for (const post of items) {
        const entry = page.locator(`a[href="/posts/${post.slug}"]`);
        await expect(entry, post.slug).toHaveCount(1, { timeout: 0 });
        if (post.excerpt) {
          await expect(entry).toContainText(post.excerpt, { timeout: 0 });
        }
        await expect(entry.locator('time')).toHaveText(
          formatPostShortDate(post.publishedAt),
          { timeout: 0 },
        );
      }
    }).toPass();
    const html = await page.content();
    expect(html).toContain(`Excerpt for ${slug}.`);
    await expect(
      page.getByRole('link', { name: 'Subscribe via RSS' }),
    ).toHaveAttribute('href', '/rss.xml');
    await context.close();
  });

  test('each entry is one link with a visible focus ring', async ({
    page,
    browserName,
  }) => {
    await page.goto(`${site()}/posts`);
    const entry = page.locator(`a[href="/posts/${slug}"]`);
    await expect(entry).toBeVisible();
    const item = page.locator('li.post-preview', { has: entry });
    await expect(item.locator('a')).toHaveCount(1);

    // Safari only tabs to links with Option held.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await focusJustBefore(item);
    await page.keyboard.press(tab);
    await expect(entry).toBeFocused();
    const ring = await entry.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        style: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
      };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    await expect(entry.locator('.post-preview__title')).toHaveCSS(
      'text-decoration-line',
      'underline',
    );
  });
});
