import { ulid } from 'ulid';
import { expect, test, type Seed } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

async function seedPage(
  seed: Seed,
  body: { title: string; bodyMarkdown?: string; pinned?: boolean },
) {
  const { data, error } = await seed.api.POST('/api/notebook/notes', {
    body: { id: ulid(), area: 'work', type: 'page', ...body },
  });
  if (!data) throw new Error(`seed note failed: ${JSON.stringify(error)}`);
  return data;
}

test('Notes groups pinned and recent notes and counts each note’s open tasks', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const openTask = await seed.task({ title: `${prefix} open task` });
  const doneTask = await seed.task({ title: `${prefix} done task` });
  await seed.api.POST('/api/notebook/tasks/{id}/complete', {
    params: { path: { id: doneTask.id } },
    body: { version: doneTask.version },
  });
  const pinned = await seedPage(seed, {
    title: `${prefix} Reading list`,
    bodyMarkdown: 'Books and articles',
    pinned: true,
  });
  const withTasks = await seedPage(seed, {
    title: `${prefix} Q4 planning`,
    bodyMarkdown: [
      '## Scope',
      `{{task:${openTask.id}}}`,
      `{{task:${doneTask.id}}}`,
    ].join('\n'),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/notes`);

  const pinnedSection = page.getByRole('region', { name: 'Pinned' });
  await expect(pinnedSection.getByText(pinned.title)).toBeVisible();
  const row = page.locator(`[data-note-id="${withTasks.id}"]`);
  await expect(row).toContainText('Scope');
  await expect(row).toContainText('1 open');
  await expect(
    page.getByRole('region', { name: 'This week' }).locator(row),
  ).toHaveCount(1);

  const types = page.getByRole('radiogroup', { name: 'Note type' });
  await types.getByRole('radio', { name: 'Daily' }).click();
  await expect(page.getByText(pinned.title)).toHaveCount(0);
  await types.getByRole('radio', { name: 'Pages' }).click();
  await expect(pinnedSection.getByText(pinned.title)).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
