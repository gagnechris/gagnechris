import type { Page } from '@playwright/test';
import { expect, test, type Seed } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

const daily =
  (seed: Seed, date: string, area: 'work' | 'personal' = 'work') =>
  async () => {
    const { data } = await seed.api.GET(
      '/api/notebook/notes/daily/{area}/{date}',
      { params: { path: { area, date } } },
    );
    return data;
  };

test.beforeEach(async ({ seed }) => {
  await seed.blankDailyTemplates();
});

const openToday = async (page: Page, notebook: string) => {
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await page.goto(`${notebook}/today`);
  const editor = page.getByRole('textbox', { name: 'Note body' });
  await expect(editor).toBeVisible();
  return editor;
};

test('text typed in today’s Work note is saved and back after a reload', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  await signIn();
  const editor = await openToday(page, apps.notebook);
  await editor.click();
  await page.keyboard.type('Plan the week');
  await expect
    .poll(async () => (await daily(seed, '2026-10-02')())?.bodyMarkdown)
    .toBe('Plan the week');

  await page.reload();
  await expect(editor).toHaveText('Plan the week');
});

test('text typed just before picking a calendar day or switching area is saved where it was typed', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  await signIn();
  const editor = await openToday(page, apps.notebook);

  await editor.click();
  await page.keyboard.type('Friday');
  await page.getByText('Calendar', { exact: true }).click();
  await page
    .getByRole('gridcell', { name: /^Thursday, October 1, 2026/ })
    .click();
  await expect(page).toHaveURL(/[?&]date=2026-10-01/);
  await expect(editor).not.toContainText('Friday');

  await editor.click();
  await page.keyboard.type('Thursday');
  await page
    .getByRole('radiogroup', { name: 'Notebook area' })
    .getByRole('radio', { name: 'Personal' })
    .click();
  await expect(page).toHaveURL(/[?&]area=personal/);

  await expect
    .poll(async () => (await daily(seed, '2026-10-02')())?.bodyMarkdown)
    .toBe('Friday');
  await expect
    .poll(async () => (await daily(seed, '2026-10-01')())?.bodyMarkdown)
    .toBe('Thursday');
});

test('a deleted daily note can be started again on Today', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const old = await seed.daily('2026-10-02', 'Old notes');
  page.on('dialog', (dialog) => void dialog.accept());
  await signIn();
  await page.goto(`${apps.notebook}/notes/${old.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).not.toHaveURL(new RegExp(old.id));

  const editor = await openToday(page, apps.notebook);
  await expect(editor).not.toContainText('Old notes');
  await editor.click();
  await page.keyboard.type('Fresh start');
  await expect
    .poll(async () => (await daily(seed, '2026-10-02')())?.bodyMarkdown)
    .toBe('Fresh start');
  const fresh = await daily(seed, '2026-10-02')();
  expect(fresh && 'id' in fresh && fresh.id).not.toBe(old.id);
});

test('two devices start the same empty daily note: the first keeps it, the second is told to reload', async ({
  page,
  apps,
  signIn,
  pageAs,
  users,
  seed,
}) => {
  await signIn();
  const second = await pageAs(users.owner);
  const editorA = await openToday(page, apps.notebook);
  const editorB = await openToday(second, apps.notebook);

  await editorA.click();
  await page.keyboard.type('From the laptop');
  await expect
    .poll(async () => (await daily(seed, '2026-10-02')())?.bodyMarkdown)
    .toBe('From the laptop');

  await editorB.click();
  await second.keyboard.type('From the phone');
  await expect(second.getByRole('alert')).toContainText(
    'Another tab or device already started this daily note. Copy what you typed, then reload to open it.',
  );
  await expect(editorB).toHaveText('From the phone');
  expect((await daily(seed, '2026-10-02')())?.bodyMarkdown).toBe(
    'From the laptop',
  );

  await second.reload();
  await expect(editorB).toHaveText('From the laptop');
});

test('text typed offline is saved once the connection is back, with no further edit', async ({
  page,
  context,
  apps,
  signIn,
  seed,
}) => {
  await signIn();
  const editor = await openToday(page, apps.notebook);

  await context.setOffline(true);
  const failed = page.waitForEvent(
    'requestfailed',
    (req) => req.method() === 'PUT' && req.url().includes('/daily/'),
  );
  await editor.click();
  await page.keyboard.type('Written on the train');
  await failed;
  const before = await daily(seed, '2026-10-02')();
  expect(before && 'exists' in before && before.exists).toBe(false);

  await context.setOffline(false);
  await expect
    .poll(async () => (await daily(seed, '2026-10-02')())?.bodyMarkdown)
    .toBe('Written on the train');
});
