import { ulid } from 'ulid';
import type { Page } from '@playwright/test';
import { expect, test, type Seed } from '../fixtures';

// Local midnight in New York is 04:00 UTC, so a UTC "today" would be wrong
// for the last hours of every local day.
test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

async function seedTask(
  seed: Seed,
  body: { title: string; startDate?: string | null; noteId?: string },
) {
  const { data, error } = await seed.api.POST('/api/notebook/tasks', {
    body: { id: ulid(), area: 'work', ...body },
  });
  if (!data) throw new Error(`seed task failed: ${JSON.stringify(error)}`);
  return data;
}

/** A daily note whose body embeds `tasks`, which get it as their home note. */
async function seedDaily(
  seed: Seed,
  date: string,
  tasks: { title: string; startDate?: string | null }[],
) {
  const path = { area: 'work' as const, date };
  const created = await seed.api.PUT(
    '/api/notebook/notes/daily/{area}/{date}',
    {
      params: { path },
      body: { id: ulid(), bodyMarkdown: 'Standup' },
    },
  );
  const note = created.data!;
  const seeded = [];
  for (const t of tasks)
    seeded.push(await seedTask(seed, { ...t, noteId: note.id }));
  const saved = await seed.api.PUT('/api/notebook/notes/daily/{area}/{date}', {
    params: { path },
    body: {
      id: note.id,
      version: note.version,
      bodyMarkdown: ['Standup', ...seeded.map((t) => `{{task:${t.id}}}`)].join(
        '\n',
      ),
    },
  });
  expect(saved.data?.taskIds).toEqual(seeded.map((t) => t.id));
  return { note: saved.data!, tasks: seeded };
}

const stillOpen = (page: Page) => page.getByTestId('still-open');
const comingUp = (page: Page) => page.getByTestId('coming-up');

/** Where `title` shows on Today: the note editor, Still open, Coming up. */
async function placesOf(page: Page, title: string) {
  const exact = { exact: true };
  const counts = {
    note: await page
      .locator('.markdown-editor')
      .getByText(title, exact)
      .count(),
    'still-open': await stillOpen(page).getByText(title, exact).count(),
    'coming-up': await comingUp(page).getByText(title, exact).count(),
  };
  return Object.entries(counts).flatMap(([place, n]) =>
    Array.from({ length: n }, () => place),
  );
}

async function panelsLoaded(page: Page) {
  await expect(stillOpen(page).getByText('Loading tasks…')).toHaveCount(0);
  await expect(comingUp(page).getByText('Loading tasks…')).toHaveCount(0);
}

test('an unchecked task from yesterday’s note shows in Still open after local midnight, with no write', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const title = `${prefix} sidebar spec`;
  await seedDaily(seed, '2026-10-01', [{ title }]);
  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/') && req.method() !== 'GET') {
      writes.push(`${req.method()} ${req.url()}`);
    }
  });

  // Thursday 23:59:30 in New York is already Friday in UTC.
  await page.clock.install({ time: new Date('2026-10-01T23:59:30-04:00') });
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await expect(
    page.getByRole('heading', { level: 1, name: /October 1/ }),
  ).toBeVisible();
  await panelsLoaded(page);
  await expect.poll(() => placesOf(page, title)).toEqual(['note']);

  await page.clock.fastForward('01:00');

  await expect(
    page.getByRole('heading', { level: 1, name: /October 2/ }),
  ).toBeVisible();
  const row = stillOpen(page).getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(
    row.getByRole('link', { name: 'Thu note · 1 day' }),
  ).toBeVisible();
  await expect.poll(() => placesOf(page, title)).toEqual(['still-open']);
  expect(writes).toEqual([]);
});

test('an @mon task is absent from Still open until Monday, then shows Scheduled Oct 5', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const title = `${prefix} brand fonts`;
  await seedTask(seed, { title, startDate: '2026-10-05' });
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await panelsLoaded(page);
  await expect.poll(() => placesOf(page, title)).toEqual(['coming-up']);
  await expect(comingUp(page)).toContainText('Mon, Oct 5');

  await page.clock.setFixedTime(new Date('2026-10-05T09:00:00-04:00'));
  await page.reload();
  await panelsLoaded(page);
  const row = stillOpen(page).getByRole('listitem').filter({ hasText: title });
  await expect(row).toContainText('Scheduled Oct 5');
  await expect.poll(() => placesOf(page, title)).toEqual(['still-open']);
});

test('Snooze and Drop remove the row at once and survive reload', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const dropTitle = `${prefix} recruiter email`;
  const snoozeTitle = `${prefix} renew card`;
  const pickTitle = `${prefix} plan posts`;
  const dropped = await seedTask(seed, {
    title: dropTitle,
    startDate: '2026-09-30',
  });
  const snoozed = await seedTask(seed, {
    title: snoozeTitle,
    startDate: '2026-09-28',
  });
  const picked = await seedTask(seed, {
    title: pickTitle,
    startDate: '2026-10-01',
  });

  // Hold every task write so the optimistic state is what the page shows.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/notebook/tasks/*', async (route) => {
    if (route.request().method() === 'PUT') await held;
    await route.continue();
  });

  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await expect(stillOpen(page).getByText(dropTitle)).toBeVisible();

  await page.getByRole('button', { name: `Drop ${dropTitle}` }).click();
  await expect(stillOpen(page).getByText(dropTitle)).toHaveCount(0);

  await page
    .getByRole('button', { name: `Snooze ${snoozeTitle} to Mon, Oct 5` })
    .click();
  await expect(stillOpen(page).getByText(snoozeTitle)).toHaveCount(0);
  await expect(comingUp(page).getByText(snoozeTitle)).toBeVisible();

  const menu = page.getByRole('combobox', {
    name: `Snooze ${pickTitle} to another day`,
  });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('option', { name: 'Tomorrow, Sat, Oct 3' }).click();
  await expect(stillOpen(page).getByText(pickTitle)).toHaveCount(0);
  await expect(comingUp(page)).toContainText('Tomorrow · Sat, Oct 3');

  const responses = Promise.all(
    [dropped, snoozed, picked].map((t) =>
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/notebook/tasks/${t.id}`) &&
          r.request().method() === 'PUT' &&
          r.ok(),
      ),
    ),
  );
  release();
  await responses;

  await page.reload();
  await panelsLoaded(page);
  await expect(page.getByText(dropTitle)).toHaveCount(0);
  await expect(stillOpen(page).getByText(snoozeTitle)).toHaveCount(0);
  await expect(comingUp(page).getByText(snoozeTitle)).toBeVisible();
  await expect(comingUp(page).getByText(pickTitle)).toBeVisible();

  const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
    params: { path: { id: dropped.id } },
  });
  expect(data).toMatchObject({ status: 'dropped', deleted: false });
});

test('each task appears in exactly one place on the page', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const carried = `${prefix} from yesterday`;
  const inNoteToday = `${prefix} in note due today`;
  const inNoteLater = `${prefix} in note on Tuesday`;
  const scheduledToday = `${prefix} scheduled today`;
  const tomorrow = `${prefix} tomorrow`;
  await seedDaily(seed, '2026-10-01', [{ title: carried }]);
  await seedDaily(seed, '2026-10-02', [
    { title: inNoteToday, startDate: '2026-10-02' },
    { title: inNoteLater, startDate: '2026-10-06' },
  ]);
  await seedTask(seed, { title: scheduledToday, startDate: '2026-10-02' });
  await seedTask(seed, { title: tomorrow, startDate: '2026-10-03' });

  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await panelsLoaded(page);

  await expect.poll(() => placesOf(page, inNoteToday)).toEqual(['note']);
  await expect.poll(() => placesOf(page, inNoteLater)).toEqual(['note']);
  expect(await placesOf(page, carried)).toEqual(['still-open']);
  expect(await placesOf(page, scheduledToday)).toEqual(['still-open']);
  expect(await placesOf(page, tomorrow)).toEqual(['coming-up']);
  await expect(page.getByTestId('carry-footer')).toHaveText(
    /3 open tasks will carry to Saturday if not done/,
  );
});

test('at 390px wide Today has no horizontal scroll, Snooze menu open', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const title = `${prefix} a fairly long task title that has to wrap on a phone`;
  await seedTask(seed, { title, startDate: '2026-09-29' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await expect(stillOpen(page).getByText(title)).toBeVisible();
  await page
    .getByRole('combobox', { name: `Snooze ${title} to another day` })
    .click();
  await expect(
    page.getByRole('option', { name: 'Tomorrow, Sat, Oct 3' }),
  ).toBeVisible();

  const box = await page
    .getByRole('listbox', { name: 'Show this task on…' })
    .filter({ visible: true })
    .boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
