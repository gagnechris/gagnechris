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
