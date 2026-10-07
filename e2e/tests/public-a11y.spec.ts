import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { EVERY_MARKDOWN_ELEMENT } from '@gagnechris/shared/fixtures/every-markdown-element';
import { expect, requireEnv, test, type Seed } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

async function publish(
  seed: Seed,
  kind: 'posts' | 'projects',
  body: Record<string, unknown>,
): Promise<void> {
  const { data: created, error } = await seed.api.POST(
    kind === 'posts' ? '/api/admin/posts' : '/api/admin/projects',
    { body: body as never },
  );
  if (!created)
    throw new Error(`seed ${kind} failed: ${JSON.stringify(error)}`);
  const { data: published } = await seed.api.POST(
    kind === 'posts'
      ? '/api/admin/posts/{id}/publish'
      : '/api/admin/projects/{id}/publish',
    {
      params: { path: { id: created.id } },
      body: { version: created.version },
    },
  );
  if (published?.status !== 'published') throw new Error('publish failed');
}

/**
 * One `<main>` holding the page's only `<h1>`, with the site header and
 * footer as the only other landmarks at the top of `#root`.
 */
async function expectLandmarks(page: Page, view: string) {
  const shape = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    const mains = [...document.querySelectorAll('main')];
    const h1s = [...document.querySelectorAll('h1')];
    return {
      root: [...root.children].map(
        (el) => `${el.tagName.toLowerCase()}.${el.classList[0] ?? ''}`,
      ),
      mains: mains.length,
      h1s: h1s.length,
      h1InMain: h1s.every((h1) => mains[0]?.contains(h1)),
    };
  });
  expect(shape, view).toEqual({
    root: [
      'header.site-header',
      expect.stringMatching(/^main\./),
      'footer.site-footer',
    ],
    mains: 1,
    h1s: 1,
    h1InMain: true,
  });
}

async function expectAccessible(page: Page, view: string) {
  await expectLandmarks(page, view);
  // axe reads colours mid-transition otherwise; the games loop forever.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`,
    ),
    view,
  ).toEqual([]);
}

test('every public page has one main landmark with its h1 and no axe violations', async ({
  page,
  seed,
  prefix,
  request,
}) => {
  test.setTimeout(120_000);
  const post = `${prefix}-post`;
  const postsDemo = `${prefix}-posts-demo`;
  const notebookDemo = `${prefix}-notebook-demo`;
  await publish(seed, 'posts', {
    title: 'Every markdown element',
    slug: post,
    excerpt: 'Every element the editor can produce.',
    bodyMarkdown: EVERY_MARKDOWN_ELEMENT,
  });
  for (const [slug, demo] of [
    [postsDemo, 'posts'],
    [notebookDemo, 'notebook'],
  ] as const) {
    await publish(seed, 'projects', {
      name: `${demo} demo ${prefix}`,
      slug,
      stage: 'live',
      pitch: 'A pitch.',
      bodyMarkdown: '## Why I built it\n\nBecause.',
      stack: ['React'],
      demo,
      previewImage: `/media/projects/${slug}.png`,
    });
  }
  // Parallel tests rebuild the local site too; wait for the index to list both.
  await expect
    .poll(async () => (await request.get(`${site()}/projects`)).text())
    .toContain(`data-slug="${notebookDemo}"`);

  for (const path of [
    '/',
    '/posts',
    `/posts/${post}`,
    '/projects',
    '/resume',
    '/contact',
    `/${prefix}-no-such-page`,
    '/dont-feed-the-bears',
    '/dont-feed-the-bears/camp',
    '/dont-feed-the-bears/wild',
  ]) {
    await page.goto(`${site()}${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectAccessible(page, path);
  }

  for (const slug of [postsDemo, notebookDemo]) {
    await page.goto(`${site()}/projects/${slug}`);
    const slot = page.getByRole('region', { name: 'Try it' });
    await slot.scrollIntoViewIfNeeded();
    await expect(slot.getByRole('button', { name: /^Reset/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectAccessible(page, `/projects/${slug}`);
  }

  // The posts demo's public pane prints the publisher's post markup.
  const slot = page.getByRole('region', { name: 'Try it' });
  await page.goto(`${site()}/projects/${postsDemo}`);
  await slot.scrollIntoViewIfNeeded();
  await slot.getByRole('button', { name: 'Publish' }).click();
  await slot.getByRole('button', { name: 'Post page' }).click();
  await expect(slot.locator('.post-header > h3')).toBeVisible();
  await expectAccessible(page, 'posts demo post page');
});
