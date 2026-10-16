import type { Locator } from '@playwright/test';
import { expect, test } from '../fixtures';

const token = (id: string) => `{{task:${id}}}`;

test('typing [ ] text in a note creates one task and embeds it', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} standup` });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  const title = `Call Sam ${prefix}`;
  // Slow enough that autosave fires while the line is half typed.
  await page.keyboard.type(`[ ] ${title}`, { delay: 60 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Finance needs the PO');

  const editorRow = page
    .locator('.markdown-editor')
    .getByRole('checkbox', { name: `Complete ${title}` });
  await expect(editorRow).toBeEnabled();

  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id: note.id } },
      });
      return data?.bodyMarkdown;
    })
    .toMatch(/^\{\{task:[0-9A-Z]{26}\}\}\nFinance needs the PO$/);

  const { data: tasks } = await seed.api.GET('/api/notebook/tasks', {
    params: { query: { noteId: note.id } },
  });
  expect(tasks?.items.map((t) => t.title)).toEqual([title]);
  const { data: saved } = await seed.api.GET('/api/notebook/notes/{id}', {
    params: { path: { id: note.id } },
  });
  expect(saved?.bodyMarkdown).toContain(token(tasks!.items[0]!.id));
  expect(saved?.taskIds).toEqual([tasks!.items[0]!.id]);
});

test('completing an embedded task in one note checks it in the other', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const home = await seed.note({ title: `${prefix} home` });
  const title = `Send invoice ${prefix}`;
  const task = await seed.task({ title, noteId: home.id });
  await seed.api.PUT('/api/notebook/notes/{id}', {
    params: { path: { id: home.id } },
    body: { version: home.version, bodyMarkdown: token(task.id) },
  });
  const other = await seed.note({
    title: `${prefix} other`,
    bodyMarkdown: `Follow up\n${token(task.id)}`,
  });
  await signIn();

  await page.goto(`${apps.notebook}/notes/${home.id}`);
  await page
    .locator('.markdown-editor')
    .getByRole('checkbox', { name: `Complete ${title}` })
    .click();
  await expect(
    page
      .locator('.markdown-editor')
      .getByRole('checkbox', { name: `Reopen ${title}` }),
  ).toBeChecked();
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
        params: { path: { id: task.id } },
      });
      return data?.status;
    })
    .toBe('done');

  await page.goto(`${apps.notebook}/notes/${other.id}`);
  await expect(
    page
      .locator('.markdown-editor')
      .getByRole('checkbox', { name: `Reopen ${title}` }),
  ).toBeChecked();
});

test('renaming a task changes every embed, and export writes titles instead of tokens', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const first = await seed.note({ title: `${prefix} first` });
  const done = await seed.task({ title: `Done ${prefix}`, noteId: first.id });
  await seed.api.POST('/api/notebook/tasks/{id}/complete', {
    params: { path: { id: done.id } },
    body: { version: done.version },
  });
  const task = await seed.task({
    title: `Old name ${prefix}`,
    noteId: first.id,
  });
  await seed.api.PUT('/api/notebook/notes/{id}', {
    params: { path: { id: first.id } },
    body: {
      version: first.version,
      bodyMarkdown: `${token(task.id)}\n${token(done.id)}`,
    },
  });
  const second = await seed.note({
    title: `${prefix} second`,
    bodyMarkdown: `  ${token(task.id)}`,
  });
  await signIn();

  await page.goto(`${apps.notebook}/notes/${first.id}`);
  await page
    .locator('.markdown-editor')
    .getByRole('link', { name: `Open task Old name ${prefix}` })
    .click();
  await expect(page).toHaveURL(`${apps.notebook}/tasks/${task.id}?area=work`);
  const renamed = `New name ${prefix}`;
  await page.getByRole('textbox', { name: 'Title' }).fill(renamed);
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
        params: { path: { id: task.id } },
      });
      return data?.title;
    })
    .toBe(renamed);

  for (const note of [first, second]) {
    await page.goto(`${apps.notebook}/notes/${note.id}`);
    await expect(
      page.locator('.markdown-editor').getByText(renamed, { exact: true }),
    ).toBeVisible();
  }

  await page.goto(`${apps.notebook}/notes`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  // The export ZIP is stored, not deflated, so file text is readable as-is.
  const zip = Buffer.concat(chunks).toString('utf8');
  expect(zip).toContain(`- [ ] ${renamed}\n- [x] Done ${prefix}\n`);
  expect(zip).toContain(`  - [ ] ${renamed}\n`);
  expect(zip).not.toContain('{{task:');
});

test('the same [ ] line twice makes two tasks, and a multi-line insert converts every line', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} lines` });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  const same = `Call Sam ${prefix}`;
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.type(`[ ] ${same}`);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.insertText(`[ ] First ${prefix}\n[ ] Second ${prefix}\n`);
  await page.keyboard.type('done');

  const tasksInNote = async () => {
    const { data } = await seed.api.GET('/api/notebook/tasks', {
      params: { query: { noteId: note.id } },
    });
    return (data?.items ?? []).map((t) => t.title).sort();
  };
  await expect
    .poll(tasksInNote)
    .toEqual([same, same, `First ${prefix}`, `Second ${prefix}`].sort());
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id: note.id } },
      });
      return data?.bodyMarkdown;
    })
    .toMatch(/^(\{\{task:[0-9A-Z]{26}\}\}\n){4}done$/);
  const { data: saved } = await seed.api.GET('/api/notebook/notes/{id}', {
    params: { path: { id: note.id } },
  });
  expect(new Set(saved?.taskIds).size).toBe(4);
});

test('task details open under the row, save the description and stay open after a reload', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} details` });
  const title = `Plan offsite ${prefix}`;
  const task = await seed.task({ title, noteId: note.id });
  await seed.api.PUT('/api/notebook/notes/{id}', {
    params: { path: { id: note.id } },
    body: { version: note.version, bodyMarkdown: token(task.id) },
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const show = page.getByRole('button', { name: `Show details for ${title}` });
  const hide = page.getByRole('button', { name: `Hide details for ${title}` });
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.locator('.task-embed__title-wrap + .task-embed__details-toggle'),
  ).toHaveAccessibleName(`Show details for ${title}`);
  await show.click();
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  const details = page.getByRole('group', { name: `Details for ${title}` });
  await details.getByRole('textbox', { name: `Details for ${title}` }).click();
  await page.keyboard.type('Book the venue');
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
        params: { path: { id: task.id } },
      });
      return data?.description;
    })
    .toBe('Book the venue');

  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(page.getByRole('img', { name: 'Has details' })).toBeVisible();
  await show.click();
  await page.reload();
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  await expect(details).toContainText('Book the venue');

  await page.getByRole('link', { name: `Open task ${title}` }).click();
  await expect(page.getByRole('textbox', { name: 'Note body' })).toContainText(
    'Book the venue',
  );
});

test('dragging a task by its handle takes its indented line along and the order survives a reload', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} drag` });
  const [a, b, c] = await Promise.all(
    ['Draft agenda', 'Call Sam', 'Book room'].map((t) =>
      seed.task({ title: `${t} ${prefix}`, noteId: note.id }),
    ),
  );
  await seed.api.PUT('/api/notebook/notes/{id}', {
    params: { path: { id: note.id } },
    body: {
      version: note.version,
      bodyMarkdown: [
        '## Today',
        token(a!.id),
        '  room for ten',
        '## Meetings',
        token(b!.id),
        token(c!.id),
      ].join('\n'),
    },
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const row = (id: string) =>
    page.locator(`.cm-task-embed[data-task-id="${id}"] .task-embed`);
  await row(a!.id).hover();
  const handle = page.getByRole('button', { name: `Move ${a!.title}` });
  const from = (await handle.boundingBox())!;
  const to = (await row(c!.id).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 12 });
  await expect(page.locator('.task-drop-indicator')).toBeVisible();
  await page.mouse.up();

  const expected = [
    '## Today',
    '## Meetings',
    token(b!.id),
    token(a!.id),
    '  room for ten',
    token(c!.id),
  ].join('\n');
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id: note.id } },
      });
      return data?.bodyMarkdown;
    })
    .toBe(expected);

  await page.reload();
  const titles = page.locator('.markdown-editor .cm-task-embed');
  await expect(titles).toHaveCount(3);
  await expect
    .poll(() =>
      titles.evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).dataset.taskId),
      ),
    )
    .toEqual([b!.id, a!.id, c!.id]);
});

test.describe('on Today', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('Move to tomorrow’s note takes the task off today and starts it tomorrow', async ({
    page,
    apps,
    signIn,
    seed,
    prefix,
  }) => {
    const today = await seed.daily('2026-10-02', 'Standup');
    const title = `${prefix} vendor contract`;
    const task = await seed.task({ title, noteId: today.id });
    await seed.daily('2026-10-02', `Standup\n${token(task.id)}`, {
      id: today.id,
      version: today.version,
    });
    await page.clock.setFixedTime(new Date('2026-10-02T09:00:00-04:00'));
    await signIn();
    await page.goto(`${apps.notebook}/today`);

    await page
      .locator(`.cm-task-embed[data-task-id="${task.id}"] .task-embed`)
      .click({ button: 'right', position: { x: 4, y: 4 } });
    const menu = page.getByRole('menu', { name: 'Move to' });
    await menu.getByRole('menuitem', { name: 'Another day’s note…' }).click();
    await page
      .getByRole('menu', { name: 'Move to another day’s note' })
      .getByRole('menuitem', { name: /Tomorrow/ })
      .click();

    await expect
      .poll(async () => {
        const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
          params: { path: { id: task.id } },
        });
        return [data?.startDate, data?.noteId === today.id];
      })
      .toEqual(['2026-10-03', false]);
    const { data: moved } = await seed.api.GET('/api/notebook/tasks/{id}', {
      params: { path: { id: task.id } },
    });
    const { data: tomorrow } = await seed.api.GET(
      '/api/notebook/notes/daily/{area}/{date}',
      { params: { path: { area: 'work', date: '2026-10-03' } } },
    );
    expect(tomorrow && 'id' in tomorrow ? tomorrow.id : null).toBe(
      moved?.noteId,
    );
    expect(tomorrow?.bodyMarkdown).toContain(token(task.id));
    await expect
      .poll(async () => {
        const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
          params: { path: { id: today.id } },
        });
        return data?.bodyMarkdown;
      })
      .toBe('Standup');

    await page.reload();
    await expect(page.getByTestId('still-open')).not.toContainText('Loading');
    await expect(
      page.locator('.markdown-editor').getByText(title, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId('still-open').getByText(title, { exact: true }),
    ).toHaveCount(0);
  });
});

test('Tab nests a task under the one above, the parent folds it, and Complete all finishes both', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} launch` });
  const [parent, child] = await Promise.all(
    ['Launch site', 'Write copy'].map((t) =>
      seed.task({ title: `${t} ${prefix}`, noteId: note.id }),
    ),
  );
  await seed.api.PUT('/api/notebook/notes/{id}', {
    params: { path: { id: note.id } },
    body: {
      version: note.version,
      bodyMarkdown: [token(parent!.id), token(child!.id)].join('\n'),
    },
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const row = (id: string) =>
    page.locator(`.cm-task-embed[data-task-id="${id}"] .task-embed`);
  await row(child!.id).getByRole('textbox', { name: 'Task title' }).click();
  await page.keyboard.press('Tab');

  const parentOf = async (id: string) =>
    (
      await seed.api.GET('/api/notebook/tasks/{id}', {
        params: { path: { id } },
      })
    ).data?.parentId;
  await expect.poll(() => parentOf(child!.id)).toBe(parent!.id);

  const progress = row(parent!.id).getByRole('button', {
    name: '0 of 1 subtasks done',
  });
  await expect(progress).toHaveAttribute('aria-expanded', 'true');
  await progress.click();
  await expect(progress).toHaveAttribute('aria-expanded', 'false');
  await expect(row(child!.id)).toBeHidden();
  await progress.click();
  await expect(row(child!.id)).toBeVisible();

  await row(parent!.id)
    .getByRole('checkbox', { name: `Complete ${parent!.title}` })
    .click();
  await page
    .getByRole('group', { name: `Finish ${parent!.title}` })
    .getByRole('button', { name: 'Complete all' })
    .click();
  await expect
    .poll(async () =>
      Promise.all(
        [parent!.id, child!.id].map(
          async (id) =>
            (
              await seed.api.GET('/api/notebook/tasks/{id}', {
                params: { path: { id } },
              })
            ).data?.status,
        ),
      ),
    )
    .toEqual(['done', 'done']);
});

test('All tasks shows a subtask’s parent above its title', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} plan` });
  const [parent, child] = await Promise.all(
    ['Plan offsite', 'Pick venue'].map((t) =>
      seed.task({ title: `${t} ${prefix}`, noteId: note.id }),
    ),
  );
  await seed.api.PUT('/api/notebook/notes/{id}', {
    params: { path: { id: note.id } },
    body: {
      version: note.version,
      bodyMarkdown: [token(parent!.id), `  ${token(child!.id)}`].join('\n'),
    },
  });
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);

  const childRow = page
    .getByRole('checkbox', { name: `Complete ${child!.title}` })
    .locator('xpath=ancestor::li[1]');
  await expect(childRow.locator('.task-parent-label')).toHaveText(
    parent!.title,
  );
});

test('the drag handle stays on the title’s first line while hovered', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({ title: `${prefix} handles` });
  const [parent, child, long] = await Promise.all(
    [
      'Launch site',
      'Write copy',
      'Go through every open pull request on the site repository, close the stale ones and write down what is left for next sprint',
    ].map((t) => seed.task({ title: `${t} ${prefix}`, noteId: note.id })),
  );
  await seed.api.PUT('/api/notebook/notes/{id}', {
    params: { path: { id: note.id } },
    body: {
      version: note.version,
      bodyMarkdown: [
        token(parent!.id),
        `  ${token(child!.id)}`,
        `  ${token(long!.id)}`,
      ].join('\n'),
    },
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);

  const offsets = (row: Locator) =>
    row.evaluate((el) => {
      const mid = (r: DOMRect) => r.top + r.height / 2;
      const title = el.querySelector('.task-embed__title-input')!;
      const style = getComputedStyle(title);
      const firstLine =
        title.getBoundingClientRect().top +
        parseFloat(style.paddingTop) +
        parseFloat(style.lineHeight) / 2;
      return {
        handle:
          mid(
            el.querySelector('.task-embed__handle')!.getBoundingClientRect(),
          ) - firstLine,
        check:
          mid(el.querySelector('.ui-check__box')!.getBoundingClientRect()) -
          firstLine,
        height: el.getBoundingClientRect().height,
      };
    });

  for (const task of [parent!, child!, long!]) {
    const row = page.locator(
      `.cm-task-embed[data-task-id="${task.id}"] .task-embed`,
    );
    const handle = row.getByRole('button', { name: `Move ${task.title}` });
    await row.getByRole('textbox', { name: 'Task title' }).hover();
    const before = await offsets(row);
    expect(Math.abs(before.handle)).toBeLessThan(1);
    expect(Math.abs(before.check)).toBeLessThan(1);
    if (task === long) expect(before.height).toBeGreaterThan(40);
    await handle.hover();
    expect(await offsets(row)).toEqual(before);
  }
});
