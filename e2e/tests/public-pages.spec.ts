import { expect, requireEnv, test } from '../fixtures';

// The local site serves the built app through the CloudFront functions.
const site = () => requireEnv('E2E_SITE_URL');

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ['/contact', '/dont-feed-the-bears']) {
    test(`${path} shows the site header and footer`, async ({ page }) => {
      await page.goto(`${site()}${path}`);
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible();
      await expect(page.locator('footer.site-footer')).toContainText(
        'Don’t feed the bears',
      );
    });
  }

  test('/contact shows its heading', async ({ page }) => {
    await page.goto(`${site()}/contact`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Contact' }),
    ).toBeVisible();
  });
});

test.describe('unknown URLs', () => {
  for (const path of [
    '/posts/no-such-post-e2e',
    '/projects/x',
    '/resume/x',
    '/contact/x',
    '/dont-feed-the-bears/no-such-game',
    '/dont-feed-the-bears/camp/x',
    '/x.html',
  ]) {
    test(`${path} is the styled 404 with status 404`, async ({ page }) => {
      const response = await page.goto(`${site()}${path}`);
      expect(response!.status()).toBe(404);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Page not found' }),
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Don’t feed the bears' }).first(),
      ).toHaveAttribute('href', '/dont-feed-the-bears?from=404');
      const h1Font = await page
        .getByRole('heading', { level: 1 })
        .evaluate((el) => getComputedStyle(el).fontFamily);
      expect(h1Font).toMatch(/^"?Newsreader/);
    });
  }
});

test.describe('contact form', () => {
  test('errors are linked, announced and focused, and input is kept', async ({
    page,
    apps,
  }) => {
    await page.goto(`${apps.public}/contact`);
    const email = page.getByLabel('Email');
    await email.fill('not-an-email');
    await page.getByRole('button', { name: 'Send message' }).click();

    const name = page.getByLabel('Name');
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription('Name is required');
    await expect(email).toHaveAccessibleDescription(
      'Enter a valid email address',
    );
    await expect(email).toHaveValue('not-an-email');
    await expect(page.getByRole('alert')).toHaveText(
      'Please fix the 3 highlighted fields.',
    );
  });

  test('a 429 shows the rate-limit message and keeps the input', async ({
    page,
    apps,
  }) => {
    await page.route('**/api/contact', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'rate_limited',
          message:
            'Too many contact submissions from this address. Try again later.',
        }),
      }),
    );
    await page.goto(`${apps.public}/contact`);
    await page.getByLabel('Name').fill('Ada Lovelace');
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Message').fill('Hello there');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Too many contact submissions from this address. Try again later.',
    );
    await expect(page.getByLabel('Message')).toHaveValue('Hello there');
  });

  test('controls are at least 44px tall', async ({ page, apps }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${apps.public}/contact`);
    for (const control of [
      page.getByLabel('Name'),
      page.getByLabel('Email'),
      page.getByLabel('Message'),
      page.getByRole('button', { name: 'Send message' }),
    ]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('bears games', () => {
  for (const [path, title, start] of [
    ['/dont-feed-the-bears/camp', 'Camp Rules', 'Start the evening'],
    ['/dont-feed-the-bears/wild', 'Stay Wild', 'Wake up, Maple'],
  ] as const) {
    test(`${path} loads in the site chrome and starts`, async ({ page }) => {
      await page.goto(`${site()}${path}`);
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 1, name: title }),
      ).toBeVisible();
      await page.getByRole('button', { name: start }).click();
      await expect(page.getByRole('button', { name: start })).toBeHidden();
    });
  }
});
