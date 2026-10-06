import { expect, test } from '../fixtures';

// Friday 22:30 in New York is already Saturday in UTC.
test.use({ timezoneId: 'America/New_York' });

test('the @ date menu works from the keyboard and creates a task on that day', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T22:30:00-04:00'));
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);

  const input = page.getByRole('combobox', { name: 'Quick add task' });
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.click();
  await page.keyboard.type(`${prefix} fonts @`);

  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const listbox = page.getByRole('listbox', { name: 'Show this task on…' });
  await expect(listbox.getByRole('option')).toHaveText([
    /Tomorrow\s*Sat, Oct 3/,
    /Monday\s*Oct 5/,
    /Next week\s*Mon, Oct 5/,
    /Someday\s*No date, parked/,
    'Pick a date…',
    /Deadline…\s*due:/,
  ]);
  await expect(
    page.getByRole('option', { name: 'Tomorrow, Sat, Oct 3' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('status')).toHaveText(/^6 date options\./);

  await page.keyboard.press('ArrowDown');
  const monday = page.getByRole('option', { name: 'Monday, Oct 5' });
  await expect(monday).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await monday.getAttribute('id'))!,
  );

  await page.keyboard.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue(`${prefix} fonts @`);

  await page.keyboard.press('Backspace');
  await page.keyboard.type('@');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue(`${prefix} fonts @mon `);
  await expect(input).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.type('!high');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('checkbox', { name: `Complete ${prefix} fonts` }),
  ).toBeVisible();
  await expect(input).toHaveValue('');

  const { data } = await seed.api.GET('/api/notebook/tasks', {
    params: { query: { limit: 50 } },
  });
  const created = data?.items.find((t) => t.title === `${prefix} fonts`);
  expect(created).toMatchObject({
    startDate: '2026-10-05',
    someday: false,
    priority: 'high',
  });
});

test('the @ date menu on a [ ] line in a note picks the day of the task it creates', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T22:30:00-04:00'));
  const note = await seed.note({ title: `${prefix} 1:1` });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  const title = `Match fonts ${prefix}`;
  await page.keyboard.type(`[ ] ${title} @`);

  const listbox = page.getByRole('listbox', { name: 'Show this task on…' });
  await expect(listbox.getByRole('option')).toHaveText([
    /Tomorrow\s*Sat, Oct 3/,
    /Monday\s*Oct 5/,
    /Next week\s*Mon, Oct 5/,
    /Someday\s*No date, parked/,
    'Pick a date…',
    /Deadline…\s*due:/,
  ]);
  await expect(editor).toHaveAttribute(
    'aria-controls',
    (await listbox.getAttribute('id'))!,
  );
  await expect(
    page.getByText('Stays in this note. Shows up on Today from that date.'),
  ).toBeVisible();

  await page.keyboard.press('ArrowDown');
  const monday = page.getByRole('option', { name: 'Monday, Oct 5' });
  await expect(monday).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveAttribute(
    'aria-activedescendant',
    (await monday.getAttribute('id'))!,
  );

  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  await page.keyboard.press('Backspace');
  await page.keyboard.type('@');
  await expect(listbox).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(
    page.getByRole('option', { name: 'Pick a date…' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');

  const picker = page.getByLabel('Pick a date');
  await expect(picker).toBeFocused();
  await expect(picker).toHaveValue('2026-10-03');
  await picker.fill('2026-11-01');
  await picker.press('Enter');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText(`[ ] ${title} @nov 1 `);

  await page.keyboard.type('!high');
  await page.keyboard.press('Enter');
  await expect(
    page
      .locator('.markdown-editor')
      .getByRole('checkbox', { name: `Complete ${title}` }),
  ).toBeEnabled();

  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks', {
        params: { query: { noteId: note.id } },
      });
      return data?.items.map((t) => ({
        title: t.title,
        startDate: t.startDate,
        someday: t.someday,
        priority: t.priority,
      }));
    })
    .toEqual([
      { title, startDate: '2026-11-01', someday: false, priority: 'high' },
    ]);
});

test('Deadline… on a [ ] line sets a due: date, shown as a pill and as overdue in a later day’s note', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T10:00:00-04:00'));
  const note = await seed.note({ title: `${prefix} deadlines` });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  const title = `File taxes ${prefix}`;
  await page.keyboard.type(`[ ] ${title} @dead`);
  await expect(
    page.getByRole('option', { name: 'Deadline…, due:' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveText(`[ ] ${title} due:`);

  const listbox = page.getByRole('listbox', { name: 'Deadline…' });
  await expect(listbox.getByRole('option')).toHaveText([
    /Tomorrow\s*Sat, Oct 3/,
    /Monday\s*Oct 5/,
    /Next week\s*Mon, Oct 5/,
    'Pick a date…',
  ]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveText(`[ ] ${title} due:mon `);
  await page.keyboard.press('Enter');

  const embed = page
    .locator('.markdown-editor .task-embed')
    .filter({ hasText: title });
  await expect(embed.getByText('due Mon')).toBeVisible();
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks', {
        params: { query: { noteId: note.id } },
      });
      return data?.items.map((t) => [t.startDate, t.dueDate]);
    })
    .toEqual([[null, '2026-10-05']]);

  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00-04:00'));
  await page.goto(`${apps.notebook}/today`);
  await expect(
    page.locator('.markdown-editor .task-embed').filter({ hasText: title }),
  ).toContainText('Overdue · Mon');
});
