import type { Page } from '@playwright/test';
import { afterFrames, expect, requireEnv, test } from '../fixtures';

// The local site serves the built app and prerendered pages, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

const PHONE = { width: 390, height: 844 };
const MENU_LINKS = [
  'Posts',
  'Projects',
  'Resume',
  'Contact',
  'LinkedIn',
  'GitHub',
  'RSS',
  'Don’t feed the bears',
];

// Playwright's role engine gives <summary> no role; browsers expose it as a
// button (see the accessibility tree test below).
const menuButton = (page: Page) => page.locator('summary[aria-label="Menu"]');
const menuOpen = (page: Page) =>
  page
    .locator('details.site-menu')
    .evaluate((el) => (el as HTMLDetailsElement).open);
const menuPanel = (page: Page) =>
  page.getByRole('navigation', { name: 'Menu' });

test.describe('the phone menu', () => {
  test.use({ viewport: PHONE });

  test('replaces the inline nav, opens, traps focus and closes with Escape', async ({
    page,
    apps,
  }) => {
    await page.goto(`${apps.public}/posts`);
    const button = menuButton(page);
    await expect(button).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Primary' }),
    ).toBeHidden();
    expect(await menuOpen(page)).toBe(false);
    await expect(button).toHaveAttribute('aria-controls', 'site-menu');

    await button.click();
    expect(await menuOpen(page)).toBe(true);
    const panel = menuPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('id', 'site-menu');
    const links = panel.getByRole('link');
    await expect(links).toHaveText(MENU_LINKS);
    for (const link of await links.all()) {
      const box = (await link.boundingBox())!;
      expect(
        box.height,
        (await link.textContent()) ?? undefined,
      ).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
    }
    await expect(panel.getByRole('link', { name: 'Posts' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await button.focus();
    for (const name of MENU_LINKS) {
      await page.keyboard.press('Tab');
      await expect(panel.getByRole('link', { name })).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      panel.getByRole('link', { name: 'Don’t feed the bears' }),
    ).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    expect(await menuOpen(page)).toBe(false);
    await expect(button).toBeFocused();
  });

  test('the page underneath does not scroll while it is open', async ({
    page,
    apps,
  }) => {
    await page.goto(`${apps.public}/contact`);
    await expect(menuButton(page)).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('main')!.style.minHeight = '3000px';
    });
    await menuButton(page).click();
    await expect(menuPanel(page)).toBeVisible();
    await page.mouse.move(195, 600);
    await page.evaluate(() => {
      window.addEventListener(
        'wheel',
        () => {
          (window as unknown as { wheeled: boolean }).wheeled = true;
        },
        { once: true },
      );
    });
    await page.mouse.wheel(0, 400);
    // The scroll a wheel causes lands within two frames of the event.
    await page.waitForFunction(
      () => (window as unknown as { wheeled?: boolean }).wheeled,
    );
    await afterFrames(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflowY,
      ),
    ).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(menuPanel(page)).toBeHidden();
    await expect(async () => {
      await page.mouse.wheel(0, 400);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }).toPass();
  });

  test('a link navigates and closes the menu', async ({ page, apps }) => {
    await page.goto(`${apps.public}/`);
    await menuButton(page).click();
    await menuPanel(page).getByRole('link', { name: 'Resume' }).click();
    await expect(page).toHaveURL(/\/resume$/);
    await expect(menuPanel(page)).toBeHidden();
    expect(await menuOpen(page)).toBe(false);
  });

  test('with reduced motion it opens without animating', async ({
    page,
    apps,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${apps.public}/`);
    await menuButton(page).click();
    await expect(menuPanel(page)).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test('desktop keeps the inline nav and has no menu button', async ({
  page,
  apps,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${apps.public}/posts`);
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(menuButton(page)).toBeHidden();
});

test.describe('the phone menu with JavaScript off', () => {
  test.use({ viewport: PHONE, javaScriptEnabled: false });

  for (const [label, path, link, to] of [
    [
      'a prerendered page',
      '/contact',
      'Don’t feed the bears',
      /\/dont-feed-the-bears\?from=menu$/,
    ],
    [
      'the S3 fallback 404',
      '/dont-feed-the-bears/no-such-game',
      'Contact',
      /\/contact$/,
    ],
  ] as const) {
    test(`opens on ${label} and its links work`, async ({ page }) => {
      await page.goto(`${site()}${path}`);
      const button = menuButton(page);
      await expect(button).toBeVisible();
      await expect(menuPanel(page)).toBeHidden();
      await button.click();
      await expect(menuPanel(page)).toBeVisible();
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).overflowY,
        ),
      ).toBe('hidden');
      await menuPanel(page).getByRole('link', { name: link }).click();
      await expect(page).toHaveURL(to);
      await button.click();
      await expect(menuPanel(page)).toBeVisible();
      await button.click();
      await expect(menuPanel(page)).toBeHidden();
    });
  }
});

/** Chromium's own accessibility tree: the summary's role, name and expanded state. */
const axMenuButton = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {
      role?: { value: string };
      name?: { value: string };
      ignored?: boolean;
      properties?: { name: string; value: { value: unknown } }[];
    }[];
  };
  await cdp.detach();
  const node = nodes.find(
    (n) =>
      !n.ignored && n.name?.value === 'Menu' && n.role?.value !== 'navigation',
  );
  return node
    ? {
        role: node.role?.value,
        expanded: node.properties?.find((p) => p.name === 'expanded')?.value
          .value,
      }
    : null;
};

for (const javaScriptEnabled of [true, false]) {
  test.describe(`menu button in the accessibility tree, JavaScript ${javaScriptEnabled ? 'on' : 'off'}`, () => {
    test.use({ viewport: PHONE, javaScriptEnabled });

    test('is a named button that reports expanded', async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== 'chromium',
        'Only Chromium exposes its accessibility tree to Playwright',
      );
      await page.goto(`${site()}/contact`);
      await expect(menuButton(page)).toBeVisible();
      // Chromium calls a <summary>'s role DisclosureTriangle; platform APIs map it to a button.
      expect(await axMenuButton(page)).toEqual({
        role: 'DisclosureTriangle',
        expanded: false,
      });
      await menuButton(page).click();
      await expect(menuPanel(page)).toBeVisible();
      expect(await axMenuButton(page)).toEqual({
        role: 'DisclosureTriangle',
        expanded: true,
      });
      await menuButton(page).click();
      await expect(menuPanel(page)).toBeHidden();
      expect(await axMenuButton(page)).toEqual({
        role: 'DisclosureTriangle',
        expanded: false,
      });
    });
  });
}
