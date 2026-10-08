import { expect, test, type Seed } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');
const token = (id: string) => `{{task:${id}}}`;

const noteBody = (seed: Seed, id: string) => async () => {
  const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
    params: { path: { id } },
  });
  return data?.bodyMarkdown;
};

const dailyBody = (seed: Seed, date: string) => async () => {
  const { data } = await seed.api.GET(
    '/api/notebook/notes/daily/{area}/{date}',
    { params: { path: { area: 'work', date } } },
  );
  return data?.bodyMarkdown;
};

test('completing an embedded task in Preview on Today checks it in the editor and in raw markdown', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.daily('2026-10-02', 'Standup');
  const task = await seed.task({
    title: `${prefix} call Sam`,
    noteId: note.id,
  });
  await seed.daily('2026-10-02', `Standup\n${token(task.id)}`, {
    id: note.id,
    version: note.version,
  });
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  const editorRow = (name: string) =>
    page.locator('.markdown-editor').getByRole('checkbox', { name });
  await expect(editorRow(`Complete ${task.title}`)).toBeVisible();

  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('region', { name: 'Preview' });
  await preview
    .getByRole('checkbox', { name: `Complete ${task.title}` })
    .click();
  await expect(
    preview.getByRole('checkbox', { name: `Reopen ${task.title}` }),
  ).toBeChecked();

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(editorRow(`Reopen ${task.title}`)).toBeChecked();
  await page.getByRole('button', { name: 'Markdown' }).click();
  await expect(editorRow(`Reopen ${task.title}`)).toBeChecked();
  const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
    params: { path: { id: task.id } },
  });
  expect(data?.status).toBe('done');
});

test('Add to today’s note from Preview returns to the editor with the caret under the task', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const task = await seed.task({
    title: `${prefix} reply to recruiter`,
    startDate: '2026-10-02',
  });
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await page.getByRole('textbox', { name: 'Note body' }).click();
  await page.keyboard.type('Standup');
  await page.keyboard.press('ControlOrMeta+/');
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview).toContainText('Standup');

  await page
    .getByRole('button', { name: `Add ${task.title} to today’s note` })
    .click();
  await expect(preview).toBeHidden();
  await expect(page.locator('.cm-content')).toBeFocused();
  await page.keyboard.type('Finance needs the PO');
  await expect
    .poll(dailyBody(seed, '2026-10-02'))
    .toBe(`Standup\n\n${token(task.id)}\nFinance needs the PO\n`);
});

test('slow saves while switching modes keep every word', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({
    title: `${prefix} slow`,
    bodyMarkdown: 'Start',
  });
  // Each save is still in flight when the next switch happens.
  await page.route('**/api/notebook/notes/**', async (route) => {
    if (route.request().method() === 'PUT') {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  const expected = ['Start'];
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(` w${i}`, { delay: 40 });
    expected.push(`w${i}`);
    await page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes(note.id),
    );
    await page.keyboard.press('ControlOrMeta+/');
    await expect(page.getByRole('region', { name: 'Preview' })).toContainText(
      `w${i}`,
    );
    await page.keyboard.press('ControlOrMeta+/');
    await page.getByRole('button', { name: 'Markdown' }).click();
  }
  await expect(editor).toHaveText(expected.join(' '));
  await expect.poll(noteBody(seed, note.id)).toBe(expected.join(' '));
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('text typed just before changing day is saved to its own day', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  await seed.daily('2026-10-01', 'Yesterday');
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  const editor = page.getByRole('textbox', { name: 'Note body' });

  await editor.click();
  await page.keyboard.type('Today');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(editor).toHaveText('Yesterday');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' plus');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(editor).toHaveText('Today');

  await expect.poll(dailyBody(seed, '2026-10-02')).toBe('Today');
  await expect.poll(dailyBody(seed, '2026-10-01')).toBe('Yesterday plus');
});

test('[ ] in raw markdown makes a task that stays a row in live mode', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} raw`, bodyMarkdown: '' });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  await page.getByRole('button', { name: 'Markdown' }).click();
  const title = `Raw task ${prefix}`;
  await page.keyboard.type(`[ ] ${title}`);
  await page.keyboard.press('Enter');
  const row = page
    .locator('.markdown-editor')
    .getByRole('checkbox', { name: `Complete ${title}` });
  await expect(row).toBeVisible();

  await page.getByRole('button', { name: 'Markdown' }).click();
  await expect(row).toBeVisible();
  await expect
    .poll(noteBody(seed, note.id))
    .toMatch(/^\{\{task:[0-9A-Z]{26}\}\}\n$/);
});

test('undo reaches typing done before the mode switches', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({
    title: `${prefix} undo`,
    bodyMarkdown: 'Base',
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' added');
  await page.getByRole('button', { name: 'Markdown' }).click();
  await page.keyboard.press('ControlOrMeta+/');
  await page.keyboard.press('ControlOrMeta+/');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).toHaveText('Base');
});
