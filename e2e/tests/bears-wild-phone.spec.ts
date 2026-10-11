import { expect, test } from '../fixtures';

test.describe('Stay Wild on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test('portrait asks to turn sideways; landscape shows the game', async ({
    page,
    apps,
  }) => {
    await page.goto(`${apps.public}/dont-feed-the-bears/wild`);

    const prompt = page.getByRole('region', {
      name: 'Turn your phone sideways',
    });
    await expect(prompt).toBeVisible();
    await expect(page.getByRole('group', { name: 'Stay Wild' })).toBeHidden();
    await expect(page.locator('.bears-game-page__actions')).toBeHidden();

    await page.setViewportSize({ width: 852, height: 393 });
    await expect(prompt).toBeHidden();
    await expect(page.locator('.bears-game-page__actions')).toBeVisible();
    await page.getByRole('button', { name: 'Wake up, Maple' }).click();
    await expect(page.getByRole('button', { name: 'Jump' })).toBeVisible();

    await page.setViewportSize({ width: 393, height: 852 });
    await expect(prompt).toBeVisible();
    await prompt
      .getByRole('link', { name: 'Or play Camp Rules in portrait' })
      .click();
    await expect(page).toHaveURL(/\/dont-feed-the-bears\/camp/);
    await expect(
      page.getByRole('button', { name: 'Start the evening' }),
    ).toBeVisible();
  });
});
