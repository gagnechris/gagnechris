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
  await expect(page.getByRole('main').getByText(pinned.title)).toHaveCount(0);
  await types.getByRole('radio', { name: 'Standing' }).click();
  await expect(pinnedSection.getByText(pinned.title)).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('New opens a day or a standing note; standing notes stay in the sidebar until archived', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const pinned = await seedPage(seed, {
    title: `${prefix} Runbook`,
    pinned: true,
  });
  const project = await seedPage(seed, { title: `${prefix} Project X` });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/notes?area=work`);

  const sidebar = page.getByRole('navigation', { name: 'Standing notes' });
  const sidebarTitles = async () =>
    (await sidebar.getByRole('link').allTextContents()).filter((t) =>
      t.startsWith(prefix),
    );
  await expect.poll(sidebarTitles).toEqual([pinned.title, project.title]);

  await page.getByRole('button', { name: 'New', exact: true }).click();
  const menu = page.getByRole('group', { name: 'New note' });
  await expect(menu.getByLabel('Note for a day')).toHaveValue('2026-10-02');
  await menu.getByLabel('Note for a day').fill('2026-09-28');
  await menu.getByRole('button', { name: 'Open day' }).click();
  await expect(page).toHaveURL(/\/today\?date=2026-09-28&area=work/);

  await page.goto(`${apps.notebook}/notes?area=work`);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Standing note' }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9A-Z]{26}(\?|$)/);
  await page.getByRole('textbox', { name: 'Title' }).fill(`${prefix} Ideas`);
  await expect
    .poll(sidebarTitles)
    .toEqual([pinned.title, `${prefix} Ideas`, project.title]);

  await sidebar.getByRole('link', { name: project.title }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(
    project.title,
  );
  await page.getByRole('button', { name: 'Note options' }).click();
  await page.getByRole('button', { name: 'Archive note' }).click();
  await expect(page.getByText('Work standing note · Archived')).toBeVisible();
  await expect.poll(sidebarTitles).toEqual([pinned.title, `${prefix} Ideas`]);

  await page.goto(`${apps.notebook}/notes?area=work`);
  const list = page.getByRole('main');
  await expect(list.getByText(pinned.title)).toBeVisible();
  await expect(list.getByText(project.title)).toHaveCount(0);
  const types = page.getByRole('radiogroup', { name: 'Note type' });
  await types.getByRole('radio', { name: 'Standing' }).click();
  await expect(list.getByText(`${prefix} Ideas`)).toBeVisible();
  await expect(list.getByText(project.title)).toHaveCount(0);
  await types.getByRole('radio', { name: 'Archived' }).click();
  await expect(list.getByText(project.title)).toBeVisible();
  await expect(list.getByText(pinned.title)).toHaveCount(0);

  await list.getByRole('link', { name: new RegExp(project.title) }).click();
  await page.getByRole('button', { name: 'Note options' }).click();
  await page.getByRole('button', { name: 'Unarchive note' }).click();
  await expect
    .poll(sidebarTitles)
    .toEqual([pinned.title, project.title, `${prefix} Ideas`]);
});
