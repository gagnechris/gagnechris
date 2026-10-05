import { ulid } from 'ulid';
import { expect, test, type Seed } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

async function seedTask(
  seed: Seed,
  body: { title: string; startDate?: string | null; someday?: boolean },
) {
  const { data, error } = await seed.api.POST('/api/notebook/tasks', {
    body: { id: ulid(), area: 'work', ...body },
  });
  if (!data) throw new Error(`seed task failed: ${JSON.stringify(error)}`);
  return data;
}

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
  await seedTask(seed, { title: monday, startDate: '2026-10-05' });
  await seedTask(seed, { title: later, startDate: '2026-11-01' });
  await seedTask(seed, { title: parked, someday: true });

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
