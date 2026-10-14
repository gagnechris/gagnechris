import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');
const TASK_TOKEN = /\{\{task:([0-9A-Z]{26})\}\}/g;

const templateMenu = (page: Page) =>
  page.getByRole('listbox', { name: 'Insert template' });

test('a template made in Settings keeps its name and text', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/settings/note-templates`);
  const name = `HM Screen Interview ${prefix}`;
  await page.getByRole('textbox', { name: 'New template' }).fill(name);
  await page.getByRole('button', { name: 'Create' }).click();

  const body = page.getByRole('textbox', { name: 'Template text' });
  await body.click();
  await page.keyboard.type('## Questions\n');
  await page.keyboard.type('[ ] Send feedback');

  const saved = async () => {
    const { data } = await seed.api.GET('/api/notebook/templates/notes');
    return data?.items.find((t) => t.name === name)?.bodyMarkdown;
  };
  await expect.poll(saved).toBe('## Questions\n[ ] Send feedback');
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Templates' }).getByRole('button', { name }),
  ).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('textbox', { name: 'Template text' })).toHaveText(
    /Send feedback/,
  );
});

test('/ in a daily note inserts the template; its task lines become tasks in that note', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await seed.blankDailyTemplates();
  const name = `Screen ${prefix}`;
  await seed.noteTemplate(
    name,
    `## Screen · {{weekday}}\n\n[ ] Send feedback ${prefix}\n[ ] Book debrief ${prefix}\n\nNotes:\n`,
  );
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);

  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  await page.keyboard.type('Intro');
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/screen ${prefix}`);
  await expect(templateMenu(page).getByRole('option')).toHaveText([
    new RegExp(name),
  ]);
  await page.keyboard.press('Enter');
  await expect(templateMenu(page)).toHaveCount(0);

  const rows = page.locator('.markdown-editor').getByRole('checkbox');
  await expect(
    page
      .locator('.markdown-editor')
      .getByRole('checkbox', { name: `Complete Send feedback ${prefix}` }),
  ).toBeEnabled();
  await expect(rows).toHaveCount(2);

  const daily = async () => {
    const { data } = await seed.api.GET(
      '/api/notebook/notes/daily/{area}/{date}',
      { params: { path: { area: 'work', date: '2026-10-02' } } },
    );
    return data && 'id' in data ? data : undefined;
  };
  await expect
    .poll(async () => (await daily())?.bodyMarkdown.replace(TASK_TOKEN, 'T'))
    .toBe('Intro\n## Screen · Friday\n\nT\nT\n\nNotes:\n');
  const note = (await daily())!;
  const { data: tasks } = await seed.api.GET('/api/notebook/tasks', {
    params: { query: { noteId: note.id } },
  });
  expect(tasks?.items.map((t) => t.title).sort()).toEqual([
    `Book debrief ${prefix}`,
    `Send feedback ${prefix}`,
  ]);
  expect(note.taskIds).toHaveLength(2);
});

test('Insert template… in the ⋯ menu inserts into a page and makes its tasks', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const name = `Retro ${prefix}`;
  await seed.noteTemplate(name, `## Retro\n[ ] Share notes ${prefix}\n`);
  const note = await seed.note({
    title: `${prefix} retro`,
    bodyMarkdown: 'Agenda',
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  await page.getByRole('button', { name: 'Note options' }).click();
  await page.getByRole('button', { name: 'Insert template…' }).click();
  await page.getByRole('combobox', { name: 'Filter templates' }).fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).click();

  await expect(
    page
      .locator('.markdown-editor')
      .getByRole('checkbox', { name: `Complete Share notes ${prefix}` }),
  ).toBeEnabled();
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id: note.id } },
      });
      return data?.bodyMarkdown.replace(TASK_TOKEN, 'T');
    })
    .toBe('Agenda\n## Retro\nT\n');
  const { data: tasks } = await seed.api.GET('/api/notebook/tasks', {
    params: { query: { noteId: note.id } },
  });
  expect(tasks?.items.map((t) => t.title)).toEqual([`Share notes ${prefix}`]);
});

test('/ on a task page inserts the template into the description', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const name = `Hiring ${prefix}`;
  await seed.noteTemplate(name, '- Role\n- Budget\n');
  const task = await seed.task({ title: `${prefix} hire` });
  await signIn();
  await page.goto(`${apps.notebook}/tasks/${task.id}`);

  await page.getByRole('textbox', { name: 'Note body' }).click();
  await page.keyboard.type(`/hiring ${prefix}`);
  await expect(templateMenu(page).getByRole('option')).toHaveText([
    new RegExp(name),
  ]);
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
        params: { path: { id: task.id } },
      });
      return data?.description;
    })
    .toBe('- Role\n- Budget\n');
});
