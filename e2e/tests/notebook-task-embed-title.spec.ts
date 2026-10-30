import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

for (const width of [1440, 390]) {
  test(`at ${width}px a task's title is edited in place in today's note`, async ({
    page,
    apps,
    signIn,
    seed,
    prefix,
  }, testInfo) => {
    const note = await seed.daily('2026-10-02', 'Standup');
    const title = `${prefix} call Sam`;
    const task = await seed.task({ title, noteId: note.id });
    const body = `Standup\n{{task:${task.id}}}`;
    await seed.daily('2026-10-02', body, {
      id: note.id,
      version: note.version,
    });
    const noteBody = async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id: note.id } },
      });
      return data?.bodyMarkdown;
    };
    const taskTitle = async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
        params: { path: { id: task.id } },
      });
      return data?.title;
    };

    await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
    await page.clock.setFixedTime(FRIDAY_MORNING);
    await signIn();
    await page.goto(`${apps.notebook}/today`);

    const editor = page.locator('.markdown-editor');
    const field = editor.getByRole('textbox', { name: 'Task title' });
    await expect(field).toHaveValue(title);

    await field.click();
    await page.keyboard.press('ControlOrMeta+a');
    const renamed = `${prefix} call Sam back about the PO`;
    await page.keyboard.type(renamed);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('O');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(renamed);
    await page.screenshot({
      path: testInfo.outputPath(`editing-${width}.png`),
    });

    await page.keyboard.press('Enter');
    await expect(editor.locator('.cm-content')).toBeFocused();
    // Enter starts a task line under the row; a second Enter makes it text.
    await page.keyboard.press('Enter');
    await page.keyboard.type('Follow up');

    await expect.poll(taskTitle).toBe(renamed);
    await expect.poll(noteBody).toBe(`Standup\n{{task:${task.id}}}\nFollow up`);
    await expect(field).toHaveValue(renamed);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`saved-${width}.png`) });

    // Emptied, the title goes back to the saved one and nothing is sent.
    await field.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await editor.getByText('Standup').click();
    await expect(field).toHaveValue(renamed);
    expect(await taskTitle()).toBe(renamed);
  });
}

test('at 390px a title with a URL keeps the row’s width beside its link', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.daily('2026-10-02', 'Standup');
  const title = `${prefix} read https://example.com/2026/planning/offsite-agenda before the call on Friday`;
  const task = await seed.task({ title, noteId: note.id });
  await seed.daily('2026-10-02', `Standup\n{{task:${task.id}}}`, {
    id: note.id,
    version: note.version,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);

  const row = page.locator('.markdown-editor .task-embed');
  await expect(row.getByRole('textbox', { name: 'Task title' })).toHaveValue(
    title,
  );
  const widths = await row.evaluate((el) => ({
    row: el.getBoundingClientRect().width,
    title: el.querySelector('.task-embed__title-wrap')!.getBoundingClientRect()
      .width,
    link: el.querySelector('.task-embed__link--chip')!.getBoundingClientRect()
      .width,
  }));
  expect(widths.title).toBeGreaterThan(widths.row * 0.5);
  expect(widths.link).toBeLessThan(widths.title / 3);
});
