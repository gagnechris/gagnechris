import { expect, GA_HOST, requireEnv, test } from '../fixtures';

const origins = {
  'dev server': () => requireEnv('E2E_PUBLIC_URL'),
  'built site': () => requireEnv('E2E_SITE_URL'),
};

for (const [label, origin] of Object.entries(origins)) {
  test(`the ${label} sends nothing to Google Analytics`, async ({
    context,
    page,
  }) => {
    const hits: string[] = [];
    // Aborted, so a regression fails the test without reaching the property.
    await context.route(
      (url) => GA_HOST.test(url.hostname),
      (route) => {
        hits.push(route.request().url());
        return route.abort();
      },
    );
    const scripts: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() === 'script') scripts.push(req.url());
    });

    for (const path of ['/', '/resume', '/contact']) {
      await page.goto(`${origin()}${path}`);
      await expect(page.locator('footer.site-footer')).toBeVisible();
    }
    await page.waitForLoadState('networkidle');

    expect(hits).toEqual([]);
    expect(scripts.filter((url) => new URL(url).pathname === '/ga.js')).toEqual(
      [],
    );
    expect(await page.evaluate(() => 'gtag' in window)).toBe(false);
  });
}
