import { expect, test } from '../fixtures';

const PAGES = ['/', '/posts', '/resume', '/contact', '/no-such-page'];

test('the site header and footer fit a 390px phone with 44px targets', async ({
  page,
  apps,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of PAGES) {
    await page.goto(`${apps.public}${path}`);
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBe(0);

    const targets = page.locator(
      '.site-header a:visible, .site-menu__button, .site-footer a:visible',
    );
    await expect(targets).toHaveCount(4);
    for (const target of await targets.all()) {
      const box = await target.boundingBox();
      const name =
        (await target.textContent()) ||
        (await target.getAttribute('aria-label'));
      expect(box!.height, `${path} ${name}`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${path} ${name}`).toBeGreaterThanOrEqual(44);
      expect(box!.x, `${path} ${name}`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${path} ${name}`).toBeLessThanOrEqual(390);
    }
  }
});

test('keyboard focus on the site chrome shows a ring', async ({
  page,
  apps,
  browserName,
}) => {
  await page.goto(`${apps.public}/posts`);
  await expect(
    page.getByRole('link', { name: 'Posts' }).first(),
  ).toHaveAttribute('aria-current', 'page');
  // Safari only tabs to links with Option held.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveText('Chris Gagne');
  const outline = await focused.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).not.toBe('none');
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
});

test('fonts load only from the site itself', async ({ page, apps }) => {
  const origin = new URL(apps.public).origin;
  const fonts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fonts.push(request.url());
  });
  await page.goto(`${apps.public}/resume`);
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.length).toBeGreaterThan(0);
  for (const url of fonts) expect(new URL(url).origin).toBe(origin);
});
