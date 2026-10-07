import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

test('Upcoming groups scheduled and parked tasks, and Do today moves one to Today', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const monday = `${prefix} brand fonts`;
  const later = `${prefix} renew passport`;
  const parked = `${prefix} learn piano`;
  await seed.task({ title: monday, startDate: '2026-10-05' });
  await seed.task({ title: later, startDate: '2026-11-01' });
  await seed.task({ title: parked, someday: true });

  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/upcoming`);

  const group = (name: string) =>
    page.getByRole('region', { name: new RegExp(`^${name}`) });
  await expect(group('Monday').getByText(monday)).toBeVisible();
  await expect(group('Later').getByText(later)).toBeVisible();
  await expect(group('Later')).toContainText('Sun, Nov 1');
  await expect(group('Someday').getByText(parked)).toBeVisible();

  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().includes('/tasks/'),
  );
  await page.getByRole('button', { name: `Do “${parked}” today` }).click();
  await expect(page.getByText(parked)).toHaveCount(0);
  expect((await saved).ok()).toBe(true);

  await page.getByRole('link', { name: /^Today/ }).click();
  await expect(page.getByTestId('still-open').getByText(parked)).toBeVisible();

  await page.goto(`${apps.notebook}/upcoming`);
  await expect(group('Monday').getByText(monday)).toBeVisible();
  await expect(page.getByText(parked)).toHaveCount(0);
});
