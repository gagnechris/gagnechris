import { expect, test } from '../fixtures';

test.use({ viewport: { width: 393, height: 852 } });

const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA');

test('Upcoming rows snooze, and Tasks rows snooze and drop', async ({
  page,
  apps,
  prefix,
  signIn,
  seed,
}) => {
  const later = await seed.task({
    title: `${prefix} later`,
    startDate: inDays(10),
  });
  const open = await seed.task({ title: `${prefix} open` });
  await signIn();

  await page.goto(`${apps.notebook}/upcoming`);
  const row = page.locator(`[data-task-id="${later.id}"]`);
  const snooze = row.getByRole('button', {
    name: new RegExp(`^Snooze ${later.title} to `),
  });
  const before = await snooze.getAttribute('aria-label');
  expect((await snooze.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await snooze.click();
  await expect(snooze).not.toHaveAttribute('aria-label', before!);

  await page.goto(`${apps.notebook}/tasks`);
  const list = page.getByRole('list', { name: 'Open tasks' });
  await expect(list.getByText(open.title)).toBeVisible();
  await list.getByRole('button', { name: `Drop ${open.title}` }).click();
  await expect(list.getByText(open.title)).toBeHidden();
});

test('Tasks filters are chips on a phone', async ({
  page,
  apps,
  prefix,
  signIn,
  seed,
}) => {
  const someday = await seed.task({
    title: `${prefix} someday`,
    someday: true,
  });
  const today = await seed.task({ title: `${prefix} today` });
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);
  await expect(page.getByLabel('Filter by status')).toBeHidden();
  const chips = page.getByRole('radiogroup', { name: 'Show tasks' });
  await expect(chips.getByRole('radio')).toHaveText([
    'Open',
    'Today',
    'Upcoming',
    'Someday',
    'Done',
  ]);
  await chips.getByRole('radio', { name: 'Someday' }).click();
  await expect(page.getByText(someday.title)).toBeVisible();
  await expect(page.getByText(today.title)).toBeHidden();
});

test('task detail has Complete and Snooze above the tab bar', async ({
  page,
  apps,
  prefix,
  signIn,
  seed,
}) => {
  const task = await seed.task({ title: `${prefix} detail` });
  await signIn();
  await page.goto(`${apps.notebook}/tasks/${task.id}`);
  const tabs = page.getByRole('navigation', { name: 'Notebook' });
  const complete = page.getByRole('button', { name: 'Complete' });
  const snooze = page.getByRole('combobox', {
    name: `Snooze ${task.title} to another day`,
  });
  await expect(complete).toHaveCount(1);
  const tabTop = (await tabs.boundingBox())!.y;
  for (const control of [complete, snooze]) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(tabTop);
  }

  await snooze.click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  expect((await menu.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Escape');

  await complete.click();
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
});

test('search fills the screen on a phone', async ({ page, apps, signIn }) => {
  await signIn();
  await page.goto(`${apps.notebook}/notes`);
  await page
    .getByRole('navigation', { name: 'Notebook' })
    .getByRole('button', { name: 'More' })
    .click();
  await page.getByRole('button', { name: /Search everything/ }).click();
  const field = page.getByRole('combobox', { name: /Search/ });
  await expect(field).toBeFocused();
  const panel = page.locator('.workspace-search__panel');
  expect(await panel.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 393,
    height: 852,
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(field).toBeHidden();
});
