import type { Page } from '@playwright/test';
import { expect, requireEnv, test, type Seed } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

type Body = {
  name: string;
  slug: string;
  stage: 'idea' | 'building' | 'live';
  pitch?: string;
  bodyMarkdown?: string;
  stack?: string[];
  demo?: 'posts' | 'notebook';
  previewImage?: string;
  href?: string;
  order?: number;
};

async function publishProject(seed: Seed, body: Body): Promise<string> {
  const { data: created, error } = await seed.api.POST('/api/admin/projects', {
    body,
  });
  if (!created)
    throw new Error(`seed project failed: ${JSON.stringify(error)}`);
  const { data: published } = await seed.api.POST(
    '/api/admin/projects/{id}/publish',
    {
      params: { path: { id: created.id } },
      body: { version: created.version },
    },
  );
  if (published?.status !== 'published') throw new Error('publish failed');
  return created.id;
}

/** Captures `#root` before the app's modules run, so it is the prerender. */
const capturePrerender = (page: Page) =>
  page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return;
      (window as unknown as { prerender: string }).prerender = document
        .getElementById('root')!
        .innerHTML.replace(/<!--prerender:(start|end)-->/g, '');
    });
  });

const card = (page: Page, slug: string) =>
  page.locator(`.project-list li.project-card[data-slug="${slug}"]`);

test.describe('/projects', () => {
  let slugs: Record<'live' | 'building' | 'elsewhere' | 'idea', string>;

  test.beforeEach(async ({ seed, prefix, request }) => {
    slugs = {
      live: `${prefix}-live`,
      building: `${prefix}-building`,
      elsewhere: `${prefix}-elsewhere`,
      idea: `${prefix}-idea`,
    };
    const body = '## Why I built it\n\nBecause.';
    await publishProject(seed, {
      name: `Live ${prefix}`,
      slug: slugs.live,
      stage: 'live',
      pitch: 'Live pitch.',
      bodyMarkdown: body,
      stack: ['React', 'DynamoDB'],
      demo: 'posts',
      previewImage: `/media/projects/${prefix}-live.png`,
      order: 1,
    });
    await publishProject(seed, {
      name: `Building ${prefix}`,
      slug: slugs.building,
      stage: 'building',
      pitch: 'Building pitch.',
      bodyMarkdown: body,
      demo: 'notebook',
      previewImage: `/media/projects/${prefix}-building.png`,
      order: 2,
    });
    await publishProject(seed, {
      name: `Elsewhere ${prefix}`,
      slug: slugs.elsewhere,
      stage: 'live',
      href: '/dont-feed-the-bears',
      order: 3,
    });
    await publishProject(seed, {
      name: `Idea ${prefix}`,
      slug: slugs.idea,
      stage: 'idea',
      order: 4,
    });
    // Parallel tests rebuild the local site too; wait until the index lists all four.
    await expect
      .poll(async () => (await request.get(`${site()}/projects`)).text())
      .toContain(`data-slug="${slugs.idea}"`);
  });

  test('each entry is one link with a focus ring; the unlinked idea is skipped', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${site()}/projects`);
    await expect(card(page, slugs.idea)).toBeVisible();

    for (const key of ['live', 'building', 'elsewhere'] as const) {
      await expect(card(page, slugs[key]).locator('a')).toHaveCount(1);
    }
    await expect(card(page, slugs.elsewhere).locator('a')).toHaveAttribute(
      'href',
      '/dont-feed-the-bears',
    );
    await expect(
      card(page, slugs.idea).locator('a, button, [tabindex]'),
    ).toHaveCount(0);

    const focusedSlugs: string[] = [];
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press(tab);
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const slug = el?.closest('li.project-card')?.getAttribute('data-slug');
        if (!el || !slug) return null;
        const style = getComputedStyle(el);
        return {
          slug,
          outline: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
        };
      });
      if (!focused) continue;
      focusedSlugs.push(focused.slug);
      expect(focused.outline, focused.slug).not.toBe('none');
      expect(focused.width, focused.slug).toBeGreaterThanOrEqual(2);
      if (focused.slug === slugs.elsewhere) break;
    }
    expect(focusedSlugs).toEqual(
      expect.arrayContaining([slugs.live, slugs.building, slugs.elsewhere]),
    );
    expect(focusedSlugs).not.toContain(slugs.idea);
  });

  test('status is text; the building pulse stops under reduced motion', async ({
    page,
  }) => {
    await page.goto(`${site()}/projects`);
    const stage = (slug: string) => card(page, slug).locator('.project-stage');
    await expect(stage(slugs.live)).toHaveText('Live');
    await expect(stage(slugs.building)).toHaveText('Building');
    await expect(stage(slugs.idea)).toHaveText('Idea');

    const animation = () =>
      stage(slugs.building).evaluate(
        (el) => getComputedStyle(el, '::before').animationName,
      );
    expect(await animation()).not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await animation()).toBe('none');
  });

  test('at 390px the preview stacks above the text, with no horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${site()}/projects`);
    await expect(card(page, slugs.live)).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    for (const slug of Object.values(slugs)) {
      const link = await card(page, slug)
        .locator('.project-card__link')
        .boundingBox();
      const preview = await card(page, slug)
        .locator('.project-preview')
        .boundingBox();
      const text = await card(page, slug)
        .locator('.project-card__text')
        .boundingBox();
      expect(preview!.width, slug).toBeCloseTo(link!.width, 0);
      expect(preview!.y + preview!.height, slug).toBeLessThanOrEqual(text!.y);
    }
  });

  test('a cold load mounts the same DOM as the prerender', async ({ page }) => {
    await capturePrerender(page);
    await page.goto(`${site()}/projects`);
    await expect(card(page, slugs.live)).toBeVisible();
    const { before, after } = await page.evaluate(() => ({
      before: (window as unknown as { prerender: string }).prerender,
      after: document.getElementById('root')!.innerHTML,
    }));
    expect(before).toContain(`data-slug="${slugs.live}"`);
    expect(after).toBe(before);
  });

  test('Home lists projects that are not ideas under What I’m building', async ({
    page,
  }) => {
    await capturePrerender(page);
    await page.goto(`${site()}/`);
    const section = page.getByRole('region', { name: 'What I’m building' });
    await expect(section).toBeVisible();
    await expect(section.locator('.project-card')).not.toHaveCount(0);
    expect(await section.locator('.project-card').count()).toBeLessThanOrEqual(
      2,
    );
    await expect(section.locator('[data-stage="idea"]')).toHaveCount(0);
    await expect(
      section.getByRole('link', { name: 'All projects' }),
    ).toHaveAttribute('href', '/projects');
    await expect(
      page.locator('.home-hero__links').getByRole('link', {
        name: 'what I’m building',
      }),
    ).toHaveAttribute('href', '/projects');
    const { before, after } = await page.evaluate(() => ({
      before: (window as unknown as { prerender: string }).prerender,
      after: document.getElementById('root')!.innerHTML,
    }));
    expect(after).toBe(before);
  });
});
