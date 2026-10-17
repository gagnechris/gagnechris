import type { Locator } from '@playwright/test';
import { expect, test } from '../fixtures';

const look = (target: Locator) =>
  target.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      transform: style.transform,
      boxShadow: style.boxShadow,
    };
  });

test('app buttons and the search backdrop keep their look on hover', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/today`);

  const searchButton = page.getByRole('button', { name: 'Search everything' });
  await searchButton.hover();
  await expect
    .poll(() => look(searchButton))
    .toMatchObject({ transform: 'none', boxShadow: 'none' });

  await searchButton.click();
  const backdrop = page.getByRole('button', { name: 'Close search' });
  // The backdrop fills the viewport, so read its resting look from an
  // unhoverable clone.
  const resting = await backdrop.evaluate((el) => {
    const clone = el.cloneNode() as HTMLElement;
    clone.style.pointerEvents = 'none';
    el.after(clone);
    const style = getComputedStyle(clone);
    const result = {
      background: style.backgroundColor,
      transform: style.transform,
      boxShadow: style.boxShadow,
    };
    clone.remove();
    return result;
  });
  await backdrop.hover({ position: { x: 4, y: 4 } });
  await expect.poll(() => look(backdrop)).toEqual(resting);
  expect(resting.transform).toBe('none');
});

test('a dialog scrim keeps its look under the pointer', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${apps.admin}/settings/users`);
  await page.getByRole('button', { name: 'Invite user' }).click();
  const scrim = page
    .getByRole('button', { name: 'Close' })
    .and(page.locator('.ui-scrim'));
  await scrim.hover({ position: { x: 4, y: 4 } });
  await expect
    .poll(() => look(scrim))
    .toEqual({
      background: 'rgba(18, 25, 38, 0.4)',
      transform: 'none',
      boxShadow: 'none',
    });
});

test('sidebar links stay un-underlined on hover', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [url, name] of [
    [`${apps.notebook}/settings/templates`, 'Note templates'],
    [`${apps.admin}/`, 'Projects'],
  ] as const) {
    await page.goto(url);
    const link = page
      .getByRole('navigation')
      .getByRole('link', { name, exact: true })
      .first();
    await link.hover();
    await expect
      .poll(() =>
        link.evaluate((el) => getComputedStyle(el).textDecorationLine),
      )
      .toBe('none');
  }
});

test('a clicked sidebar link shows no focus ring until a key is pressed', async ({
  page,
  apps,
  signIn,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'WebKit does not focus a clicked link');
  await signIn();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${apps.notebook}/settings/templates`);
  const link = page
    .getByRole('navigation')
    .getByRole('link', { name: 'Note templates', exact: true })
    .first();
  const ring = () =>
    link.evaluate((el) => [
      el === document.activeElement,
      getComputedStyle(el).outlineStyle,
    ]);
  await link.click();
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect.poll(ring).toEqual([true, 'none']);
  await page.keyboard.press('Shift');
  await expect.poll(ring).toEqual([true, 'solid']);
});
