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
