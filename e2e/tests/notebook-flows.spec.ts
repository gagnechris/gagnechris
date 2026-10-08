import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { parse as parseYaml } from 'yaml';
import { expect, test, type Seed } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

/** Entries of the stored (uncompressed) ZIP the Notebook export builds. */
function unzipStored(zip: Buffer): Map<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    files.set(name, zip.toString('utf8', dataAt, dataAt + size));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

async function exportZip(page: Page, notebook: string) {
  await page.goto(`${notebook}/notes`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export' }).click(),
  ]);
  return unzipStored(await readFile(await (download as Download).path()));
}

const frontMatter = (markdown: string) =>
  parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(markdown)![1]!) as Record<
    string,
    unknown
  >;

/** Runs `make` for 0..count-1, `batch` at a time, so the local API isn't swamped. */
async function inBatches<T>(
  count: number,
  make: (i: number) => Promise<T>,
  batch = 20,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; start < count; start += batch) {
    const end = Math.min(count, start + batch);
    out.push(
      ...(await Promise.all(
        Array.from({ length: end - start }, (_, k) => make(start + k)),
      )),
    );
  }
  return out;
}

const getTask = async (seed: Seed, id: string) =>
  (await seed.api.GET('/api/notebook/tasks/{id}', { params: { path: { id } } }))
    .data;

test('a page is created, edited and deleted', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signIn();
  await page.goto(`${apps.notebook}/notes`);
  await page.getByRole('button', { name: 'New page' }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9A-Z]{26}(\?|$)/);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;

  await page.getByRole('textbox', { name: 'Title' }).fill(`${prefix} Plan`);
  await page.getByRole('textbox', { name: 'Note body' }).click();
  await page.keyboard.type('First draft');
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id } },
      });
      return data && { title: data.title, body: data.bodyMarkdown };
    })
    .toEqual({ title: `${prefix} Plan`, body: 'First draft' });

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/notes(\?|$)/);
  await expect(page.getByText(`${prefix} Plan`)).toHaveCount(0);
  const { response } = await seed.api.GET('/api/notebook/notes/{id}', {
    params: { path: { id } },
  });
  expect(response.status).toBe(404);
});

test('a quick-added task gets its title, deadline and priority, then completes, reopens and deletes', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);
  const quickAdd = page.getByRole('combobox', { name: 'Quick add task' });
  await quickAdd.fill(`${prefix} Call bob due:tomorrow !high`);
  await quickAdd.press('Enter');
  await expect(quickAdd).toHaveValue('');

  await page
    .getByRole('list', { name: 'Open tasks' })
    .getByRole('link', { name: new RegExp(`${prefix} Call bob`) })
    .click();
  await expect(page).toHaveURL(/\/tasks\/[0-9A-Z]{26}(\?|$)/);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  expect(await getTask(seed, id)).toMatchObject({
    title: `${prefix} Call bob`,
    dueDate: '2026-10-03',
    priority: 'high',
    status: 'todo',
  });

  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
  await expect.poll(async () => (await getTask(seed, id))?.status).toBe('done');
  await page.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.getByRole('button', { name: 'Complete' })).toBeVisible();
  await expect
    .poll(async () => (await getTask(seed, id))?.status)
    .not.toBe('done');

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/tasks(\?|$)/);
  const { response } = await seed.api.GET('/api/notebook/tasks/{id}', {
    params: { path: { id } },
  });
  expect(response.status).toBe(404);
});

test('120 old done tasks don’t hide the 3 open ones on Today and Tasks', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  test.slow();
  await inBatches(120, (i) =>
    seed.task({
      title: `${prefix} old ${i}`,
      status: 'done',
      startDate: '2026-09-01',
      dueDate: '2026-09-01',
    }),
  );
  const open = await inBatches(3, (i) =>
    seed.task({
      title: `${prefix} open ${i}`,
      startDate: '2026-10-02',
      dueDate: '2026-10-02',
    }),
  );
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();

  await page.goto(`${apps.notebook}/today`);
  const side = page.getByRole('complementary', { name: 'Today tasks' });
  for (const task of open) {
    await expect(side.getByText(task.title)).toBeVisible();
  }
  await expect(side.getByText(`${prefix} old`)).toHaveCount(0);

  await page.goto(`${apps.notebook}/tasks`);
  const list = page.getByRole('list', { name: 'Open tasks' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  for (const task of open) {
    await expect(list.getByText(task.title)).toBeVisible();
  }
});

test('All shows both areas, and the choice is kept for the next visit', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await seed.task({ title: `${prefix} work thing` });
  await seed.task({ title: `${prefix} home thing`, area: 'personal' });
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);
  const open = page.getByRole('list', { name: 'Open tasks' });
  await expect(open.getByText(`${prefix} work thing`)).toBeVisible();
  await expect(open.getByText(`${prefix} home thing`)).toHaveCount(0);

  const all = page
    .getByRole('radiogroup', { name: 'Notebook area' })
    .getByRole('radio', { name: 'All' });
  await all.click();
  await expect(all).toHaveAttribute('aria-checked', 'true');
  await expect(open.getByText(`${prefix} work thing`)).toBeVisible();
  await expect(open.getByText(`${prefix} home thing`)).toBeVisible();

  await page.goto(`${apps.notebook}/tasks`);
  await expect(all).toHaveAttribute('aria-checked', 'true');
  await expect(open.getByText(`${prefix} home thing`)).toBeVisible();
});

test('⌘K finds a page, a task and a daily note; Enter opens each where it lives; Esc gives focus back', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const word = prefix.replace(/-/g, '');
  const note = await seed.note({ title: `Plan ${word}` });
  const task = await seed.task({ title: `Review ${word}` });
  await seed.daily('2026-10-01', `Standup about ${word}`);
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);
  const search = page.getByRole('combobox', { name: 'Search notes and tasks' });
  const options = page.getByRole('listbox').getByRole('option');

  const open = async (name: RegExp) => {
    // The shortcut listener is attached once the shell has rendered.
    await expect(
      page.getByRole('button', { name: 'Search everything' }),
    ).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await search.fill(word);
    await expect(options).toHaveCount(3);
    const option = options.filter({ hasText: name });
    await expect(option).toHaveCount(1);
    while ((await option.getAttribute('aria-selected')) !== 'true') {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await expect(search).toBeHidden();
  };

  await open(/^Plan/);
  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}(\\?|$)`));
  await open(/^Review/);
  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}(\\?|$)`));
  await open(/Standup/);
  await expect(page).toHaveURL(/\/today\?date=2026-10-01&area=work$/);
  await expect(page.getByRole('textbox', { name: 'Note body' })).toHaveText(
    `Standup about ${word}`,
  );

  const previous = page.getByRole('button', { name: 'Previous' });
  await previous.focus();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(previous).toBeFocused();
});

test('Export has every note and task, with front matter that parses as YAML', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  test.slow();
  const titles = ['[WIP] plan', '- todo', 'key: value', '"quoted" #tag'];
  await inBatches(150, (i) =>
    seed.note({ title: i < titles.length ? titles[i]! : `${prefix} ${i}` }),
  );
  await inBatches(130, (i) => seed.task({ title: `${prefix} task ${i}` }));
  await signIn();

  const files = await exportZip(page, apps.notebook);
  const notes = [...files.entries()].filter(([name]) =>
    name.startsWith('notes/'),
  );
  expect(notes).toHaveLength(150);
  const exported = notes.map(([, body]) => frontMatter(body).title);
  for (const title of titles) expect(exported).toContain(title);
  const tasks = JSON.parse(files.get('tasks.json')!) as unknown[];
  expect(tasks).toHaveLength(130);
});

test('another user sees none of the owner’s notes, tasks, search hits or export', async ({
  page,
  apps,
  signIn,
  seed,
  users,
  prefix,
}) => {
  const word = prefix.replace(/-/g, '');
  await seed.note({ title: `Secret ${word}` });
  await seed.task({ title: `Secret task ${word}` });
  await seed.daily('2026-10-02', `Secret daily ${word}`);
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn(users.other);

  await page.goto(`${apps.notebook}/today`);
  await expect(page.getByRole('textbox', { name: 'Note body' })).toBeVisible();
  await expect(page.getByText(word)).toHaveCount(0);

  await page.goto(`${apps.notebook}/notes`);
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
  await expect(page.getByText(word)).toHaveCount(0);

  await page.goto(`${apps.notebook}/tasks`);
  await expect(
    page.getByRole('combobox', { name: 'Quick add task' }),
  ).toBeVisible();
  await expect(page.getByText(word)).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+k');
  const searched = page.waitForResponse(
    (r) => r.url().includes('/api/notebook/search') && r.ok(),
  );
  await page
    .getByRole('combobox', { name: 'Search notes and tasks' })
    .fill(word);
  await searched;
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const files = await exportZip(page, apps.notebook);
  expect([...files.keys()].filter((n) => n.startsWith('notes/'))).toEqual([]);
  expect(JSON.parse(files.get('tasks.json')!)).toEqual([]);
});
