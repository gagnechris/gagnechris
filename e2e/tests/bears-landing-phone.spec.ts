import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

const LANDING = '/dont-feed-the-bears';

// Box edges measured on the 393px Phone · Bears landing artboard, relative to
// the centre of the header photo (docs/design/public-redesign/README.md).
const PHONE_BOXES: readonly [
  label: string,
  selector: string,
  edge: Edge,
  px: number,
][] = [
  ['camp card top', '.bears-card--camp', 'top', 162.5],
  ['camp art bottom', '.bears-card--camp .bears-card__art', 'bottom', 273.5],
  ['camp button top', '.bears-card--camp .bears-card__cta', 'top', 376.5],
  ['camp button bottom', '.bears-card--camp .bears-card__cta', 'bottom', 420.5],
  ['camp card bottom', '.bears-card--camp', 'bottom', 437.5],
  ['wild card top', '.bears-card--wild', 'top', 451.5],
  ['wild art bottom', '.bears-card--wild .bears-card__art', 'bottom', 562.5],
  ['wild button top', '.bears-card--wild .bears-card__cta', 'top', 688.5],
  ['wild card bottom', '.bears-card--wild', 'bottom', 749.5],
];

type Edge = 'top' | 'bottom' | 'left' | 'right' | 'width';

const box = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

const fontSize = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

const within2 = (actual: number, expected: number, label: string) =>
  expect(
    Math.abs(actual - expected),
    `${label}: ${actual}`,
  ).toBeLessThanOrEqual(2);

test.describe('Bears landing at 393px', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('matches Phone · Bears landing', async ({ page, apps, browserName }) => {
    await page.goto(`${apps.public}${LANDING}`);
    // fonts.ready can settle before a face is first requested; widths are
    // only right once both self-hosted families are in.
    await page.evaluate(() =>
      Promise.all([
        document.fonts.load('700 14px Inter'),
        document.fonts.load('500 26px Newsreader'),
        document.fonts.load('400 16px Newsreader'),
      ]),
    );
    await page.evaluate(() => document.fonts.ready);

    await expect(page.locator('.bears-landing__lede')).toBeHidden();
    await expect(page.locator('.bears-card__details').first()).toBeHidden();
    await expect(
      page.getByText('Put food away and keep bears out until dark.'),
    ).toBeVisible();
    await expect(
      page.getByText('Fatten up on berries and reach the den before snow.'),
    ).toBeVisible();
    await expect(page.locator('.bears-card__text')).toHaveCount(2);

    const sizes: Record<string, number> = {
      '.bears-landing__kicker': 12,
      '.bears-landing h1': 40,
      '.bears-card__kicker': 12,
      '.bears-card__title': 26,
      '.bears-card__text': 16,
    };
    for (const [selector, px] of Object.entries(sizes)) {
      within2(await fontSize(page, selector), px, selector);
    }
    const textFont = await page
      .locator('.bears-card__text')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(textFont).toMatch(/^"?Newsreader/);

    const h1 = await box(page, '.bears-landing h1');
    within2(h1.height, 84, 'title is two 42px lines');

    const photo = await box(page, '.site-header__photo');
    const centre = photo.top + photo.height / 2;
    for (const [label, selector, edge, px] of PHONE_BOXES) {
      const b = await box(page, selector);
      within2(b[edge] - centre, px, label);
    }

    const card = await box(page, '.bears-card--camp');
    within2(card.left, 20, 'card left');
    within2(card.right, 373, 'card right');
    const cta = await box(page, '.bears-card--camp .bears-card__cta');
    within2(cta.left, 37, 'button left');
    // Chromium on Linux rounds glyph advances to whole pixels, which makes
    // the bold labels several px wider than on a phone.
    if (browserName === 'webkit' || process.platform !== 'linux') {
      within2(cta.width, 161.5, 'camp button width');
      within2(
        (await box(page, '.bears-card--wild .bears-card__cta')).width,
        140.5,
        'wild button width',
      );
    }

    const [scrollWidth, innerWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  test('keeps the Vermont Fish & Wildlife sources and ?from=', async ({
    page,
    apps,
  }) => {
    await page.goto(`${apps.public}${LANDING}?from=resume`);

    await expect(
      page.getByRole('link', {
        name: 'Vermont Fish & Wildlife’s guidance on living with black bears',
      }),
    ).toBeVisible();
    await expect(
      page.locator('#tips').getByRole('link', { name: 'Source' }).first(),
    ).toBeVisible();
    await page.getByRole('link', { name: /Camp Rules/ }).click();
    await expect(page).toHaveURL(/\/dont-feed-the-bears\/camp\?from=resume$/);
    await page.goBack();
    await page.getByRole('link', { name: /Stay Wild/ }).click();
    await expect(page).toHaveURL(/\/dont-feed-the-bears\/wild\?from=resume$/);
  });
});

test.describe('Bears landing on desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('keeps the lede and the details beside the same card copy', async ({
    page,
    apps,
  }) => {
    await page.goto(`${apps.public}${LANDING}`);

    await expect(page.locator('.bears-landing__lede')).toBeVisible();
    await expect(page.locator('.bears-card__details')).toHaveCount(2);
    await expect(page.locator('.bears-card__details').first()).toBeVisible();
    await expect(page.locator('.bears-card__text')).toHaveCount(2);
    await expect(
      page.getByText('Put food away and keep bears out until dark.'),
    ).toBeVisible();
    await expect(
      page.getByText('Fatten up on berries and reach the den before snow.'),
    ).toBeVisible();
    within2(await fontSize(page, '.bears-card__title'), 28, 'card title');
  });
});
