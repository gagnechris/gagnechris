import type { Page } from '@playwright/test';
import { expect, requireEnv, test } from '../fixtures';

// 375 is the narrowest phone; 197 is a 393px phone at 200% zoom.
const WIDTHS = [375, 197];

/** Overflow, small controls and small fields on the page as rendered. */
const measure = (page: Page) =>
  page.evaluate(() => {
    // Editor previews render the public page as it ships; its own checks cover it.
    const inPreview = (el: Element) =>
      el.closest('.admin-home-preview, .admin-resume-preview') !== null;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== 'hidden' &&
        !inPreview(el)
      );
    };
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
    const page = document.scrollingElement!;
    const vw = page.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > vw + 1 &&
          !(el.parentElement!.getBoundingClientRect().right > vw + 1),
      )
      .concat(
        // Text that overflows a box that fits, such as an unbreakable word.
        [...document.querySelectorAll<HTMLElement>('body *')].filter(
          (el) =>
            el.getBoundingClientRect().left + el.scrollWidth > vw + 1 &&
            el.scrollWidth > el.clientWidth + 1 &&
            getComputedStyle(el).overflowX === 'visible',
        ),
      )
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
      .slice(0, 5);
    const smallTargets = [
      ...document.querySelectorAll(
        'button, select, summary, [role=tab], [role=radio], input[type=checkbox]',
      ),
    ]
      .filter(visible)
      .map((el) => (el.matches('input') && el.closest('label')) || el)
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map(
        (el) => `${name(el)} ${Math.round(el.getBoundingClientRect().height)}`,
      );
    const smallFields = [
      ...document.querySelectorAll(
        'input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, [contenteditable=true]',
      ),
    ]
      .filter(visible)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${name(el)} ${getComputedStyle(el).fontSize}`);
    return {
      overflow: page.scrollWidth - vw,
      wide,
      smallTargets: [...new Set(smallTargets)],
      smallFields: [...new Set(smallFields)],
    };
  });

const expectPhoneReady = async (page: Page, url: string) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(url);
    await expect(page.locator('main').first()).toBeVisible();
    const m = await measure(page);
    expect(
      m.overflow,
      `${url} at ${width}px scrolls sideways: ${m.wide.join(', ')}`,
    ).toBe(0);
    if (width === 375) {
      expect(m.smallTargets, `${url}: controls under 44px`).toEqual([]);
      expect(m.smallFields, `${url}: fields under 16px`).toEqual([]);
    }
  }
};

test.describe('signed-in apps on a phone', () => {
  test.beforeEach(async ({ signIn }) => {
    await signIn();
  });

  test('Admin screens fit, with 44px controls and 16px fields', async ({
    page,
    apps,
    seed,
  }) => {
    const post = await seed.post({ title: 'A draft post title for a phone' });
    // Default names and slugs are long unbroken words, as real slugs can be.
    const project = await seed.project();
    await seed.publishedProject({ stage: 'live' });
    for (const path of [
      '/',
      `/posts/${post.id}`,
      '/home',
      '/resume',
      '/projects',
      `/projects/${project.id}`,
    ]) {
      await expectPhoneReady(page, new URL(path, apps.admin).href);
    }
  });

  test('Notebook screens fit, with 44px controls and 16px fields', async ({
    page,
    apps,
    prefix,
    seed,
  }) => {
    const note = await seed.note({ title: 'Phone note', bodyMarkdown: 'Hi' });
    const task = await seed.task({ title: 'Phone task' });
    const later = new Date(Date.now() + 20 * 86_400_000);
    const source = await seed.note({
      title: `${prefix} source`,
      bodyMarkdown: '',
    });
    await seed.task({
      title: `${prefix} later`,
      startDate: later.toLocaleDateString('en-CA'),
      noteId: source.id,
    });
    await seed.task({ title: `${prefix} someday`, someday: true });
    for (const path of [
      '/today',
      '/upcoming',
      '/notes',
      `/notes/${note.id}`,
      '/tasks',
      `/tasks/${task.id}`,
    ]) {
      await expectPhoneReady(page, new URL(path, apps.notebook).href);
    }
  });

  test('the post editor keeps five equal tabs', async ({
    page,
    apps,
    seed,
  }) => {
    const post = await seed.post({ title: 'Tab bar check' });
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(new URL(`/posts/${post.id}`, apps.admin).href);
    const tabs = page.locator('.workspace-nav__item:visible');
    await expect(tabs).toHaveCount(5);
    const widths = await tabs.evaluateAll((items) =>
      items.map((el) => Math.round(el.getBoundingClientRect().width)),
    );
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(70);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });
});

test('public pages fit at 200% zoom', async ({
  page,
  seed,
  prefix,
  request,
}) => {
  const site = requireEnv('E2E_SITE_URL');
  const slug = `${prefix}-zoom`;
  await seed.publishedPost({
    title: `A post title long enough to wrap ${prefix}`,
    slug,
    bodyMarkdown: 'A paragraph.\n\n```\nconst aLongLineOfCode = 1;\n```',
  });
  // Parallel tests rebuild the local site too; wait until the index lists it.
  await expect
    .poll(async () => (await request.get(`${site}/posts`)).text())
    .toContain(`href="/posts/${slug}"`);
  await page.setViewportSize({ width: 197, height: 426 });
  for (const path of ['/', '/posts', `/posts/${slug}`, '/resume', '/contact']) {
    await page.goto(new URL(path, site).href);
    const { overflow, wide } = await measure(page);
    expect(overflow, `${path} scrolls sideways: ${wide.join(', ')}`).toBe(0);
  }
});
