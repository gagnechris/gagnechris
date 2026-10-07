import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

test('a task lists every note that embeds it, with the context under the embed', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const task = await seed.task({ title: `${prefix} migrate the index` });

  const embed = `{{task:${task.id}}}`;
  const first = await seed.daily('2026-09-28', `${embed}\nRead the runbook.`);
  const second = await seed.daily(
    '2026-09-29',
    `${embed}\nDry run on staging.`,
  );
  const third = await seed.daily('2026-09-30', `${embed}\nCut over.`);

  await signIn();
  await page.goto(`${apps.notebook}/tasks/${task.id}`);

  const mentions = page.getByRole('region', { name: 'Mentioned in' });
  await expect(mentions.getByRole('listitem')).toHaveCount(3);
  await expect
    .poll(() =>
      mentions
        .getByRole('listitem')
        .evaluateAll((items) => items.map((li) => li.textContent ?? '')),
    )
    .toEqual([
      expect.stringContaining('Read the runbook.'),
      expect.stringContaining('Dry run on staging.'),
      expect.stringContaining('Cut over.'),
    ]);

  // Removing the embed drops the note from the list once the note saves.
  await page.goto(`${apps.notebook}/notes/${second.id}`);
  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Dry run on staging.');
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id: second.id } },
      });
      return data?.bodyMarkdown;
    })
    .not.toContain(task.id);

  await page.goto(`${apps.notebook}/tasks/${task.id}`);
  await expect(mentions.getByRole('listitem')).toHaveCount(2);
  await expect(mentions.locator(`[data-note-id="${second.id}"]`)).toHaveCount(
    0,
  );
  await expect(mentions.locator(`[data-note-id="${first.id}"]`)).toHaveCount(1);
  await expect(mentions.locator(`[data-note-id="${third.id}"]`)).toHaveCount(1);
});
