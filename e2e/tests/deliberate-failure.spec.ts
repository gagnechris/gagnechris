import { expect, test } from '../fixtures';

test('deliberately fails to prove trace upload', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'This heading does not exist' }),
  ).toBeVisible({ timeout: 3_000 });
});
