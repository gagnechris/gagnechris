import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, requireEnv, test } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

/**
 * `[label, from, to, px]`: the vertical distance between two box edges
 * (`selector@top|bottom`, or `photo` for the header photo's centre), from the
 * phone artboards; see docs/design/public-redesign/README.md.
 */
type Gap = [label: string, from: string, to: string, px: number];

const measure = (page: Page, gaps: readonly Gap[]) =>
  page.evaluate((gaps) => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`no ${selector}`);
      return el.getBoundingClientRect();
    };
    const photo = box('.site-header__photo');
    const edge = (ref: string) => {
      if (ref === 'photo') return photo.top + photo.height / 2;
      const [selector, side] = ref.split('@') as [string, 'top' | 'bottom'];
      return box(selector)[side];
    };
    return gaps.map(([label, from, to]) => [label, edge(to) - edge(from)]);
  }, gaps);

const expectGaps = async (page: Page, gaps: readonly Gap[]) => {
  const measured = await measure(page, gaps);
  gaps.forEach(([label, , , px], i) => {
    expect(measured[i]![1], label).toBeCloseTo(px, 0);
  });
};

const expectFontSizes = async (page: Page, sizes: Record<string, number>) => {
  for (const [selector, px] of Object.entries(sizes)) {
    expect(await fontSize(page, selector), selector).toBe(px);
  }
};

const fontSize = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

// Other tests publish posts too; any Recent post with an excerpt and a date will do.
const HOME_POST = '.home-post:has(.home-post__excerpt):has(.home-post__date)';

test.describe('phone layout at 390px', () => {
  let slug: string;
  let entry: string;

  test.beforeEach(async ({ page, seed, prefix, request }) => {
    slug = `${prefix}-${randomBytes(3).toString('hex')}`;
    const { data: created } = await seed.api.POST('/api/admin/posts', {
      body: {
        title: `Welcome ${slug}`,
        slug,
        excerpt:
          'An introduction to my new blog and what I’ll be writing about.',
        bodyMarkdown: 'First paragraph.\n\nSecond paragraph.',
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
    entry = `.post-preview[data-id="${created.id}"]`;
    // Parallel tests rebuild the local site too; wait until the index lists it.
    await expect
      .poll(async () => (await request.get(`${site()}/posts`)).text())
      .toContain(`href="/posts/${slug}"`);
    await expect
      .poll(async () => (await request.get(`${site()}/`)).text())
      .toContain('class="home-post__excerpt"');
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('Home', async ({ page }) => {
    await page.goto(`${site()}/`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('link', { name: 'All posts' })).toBeHidden();
    await expectFontSizes(page, {
      '.home-hero__name': 46,
      '.home-hero__title': 21,
      '.home-hero__about p': 19,
      '.home-hero__links': 17,
      '.home-post__title': 24,
      '.home-post__excerpt': 17,
    });
    await expectGaps(page, [
      ['photo to name', 'photo', '.home-hero__name@top', 62],
      ['name to title', '.home-hero__name@bottom', '.home-hero__title@top', 3],
      [
        'title to about',
        '.home-hero__title@bottom',
        '.home-hero__about@top',
        15,
      ],
      [
        'about to links',
        '.home-hero__about@bottom',
        '.home-hero__links@top',
        16,
      ],
      [
        'links to label',
        '.home-hero__links@bottom',
        '.home-section__head@top',
        26,
      ],
      [
        'label row',
        '.home-section__head@top',
        '.home-section__head@bottom',
        27,
      ],
      [
        'rule to title',
        '.home-section__head@bottom',
        `${HOME_POST} .home-post__title@top`,
        16,
      ],
      [
        'title to excerpt',
        `${HOME_POST} .home-post__title@bottom`,
        `${HOME_POST} .home-post__excerpt@top`,
        5,
      ],
      [
        'excerpt to date',
        `${HOME_POST} .home-post__excerpt@bottom`,
        `${HOME_POST} .home-post__date@top`,
        3,
      ],
      [
        'date to rule',
        `${HOME_POST} .home-post__date@bottom`,
        `${HOME_POST}@bottom`,
        16,
      ],
    ]);
  });

  test('Posts: the date sits under the excerpt', async ({ page }) => {
    await page.goto(`${site()}/posts`);
    await page.evaluate(() => document.fonts.ready);
    await expectFontSizes(page, {
      '.posts-index h1': 46,
      '.posts-index__intro': 19,
      '.post-preview__title': 24,
      '.post-preview__excerpt': 17,
    });
    await expectGaps(page, [
      ['photo to title', 'photo', '.posts-index h1@top', 58],
      [
        'title to intro',
        '.posts-index h1@bottom',
        '.posts-index__intro@top',
        9,
      ],
      [
        'intro to rss',
        '.posts-index__intro@bottom',
        '.posts-index__rss@top',
        -4,
      ],
      [
        'rss to label',
        '.posts-index__rss@bottom',
        '.posts-year__label@top',
        13,
      ],
      ['label row', '.posts-year__label@top', '.posts-year__label@bottom', 27],
      [
        'rule to title',
        `${entry}@top`,
        `${entry} .post-preview__title@top`,
        16,
      ],
      [
        'title to excerpt',
        `${entry} .post-preview__title@bottom`,
        `${entry} .post-preview__excerpt@top`,
        5,
      ],
      [
        'excerpt to date',
        `${entry} .post-preview__excerpt@bottom`,
        `${entry} .post-preview__date@top`,
        3,
      ],
      [
        'date to rule',
        `${entry} .post-preview__date@bottom`,
        `${entry}@bottom`,
        17,
      ],
    ]);
  });

  test('Post', async ({ page }) => {
    await page.goto(`${site()}/posts/${slug}`);
    await page.evaluate(() => document.fonts.ready);
    await expectFontSizes(page, {
      '.post-page h1': 42,
      '.post-excerpt': 20,
      '.post-content': 19,
    });
    await expectGaps(page, [
      ['photo to meta', 'photo', '.post-meta@top', 54],
      ['meta to title', '.post-meta@bottom', '.post-page h1@top', 8],
      ['title to excerpt', '.post-page h1@bottom', '.post-excerpt@top', 9],
      ['excerpt to body', '.post-excerpt@bottom', '.post-content@top', 22],
      [
        'paragraph gap',
        '.post-content > p@bottom',
        '.post-content > p + p@top',
        19,
      ],
    ]);
  });
});

test('desktop Home keeps the All posts link', async ({ page, seed }) => {
  const post = await seed.post();
  await seed.api.POST('/api/admin/posts/{id}/publish', {
    params: { path: { id: post.id } },
    body: { version: post.version },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(async () => {
    await page.goto(`${site()}/`);
    await expect(page.getByRole('link', { name: 'All posts' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
});

test('phone header: 32px photo, 19px name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${site()}/contact`);
  const photo = await page.locator('.site-header__photo').boundingBox();
  expect(photo!.width).toBe(32);
  await expectFontSizes(page, { '.site-header__name': 19 });
});
