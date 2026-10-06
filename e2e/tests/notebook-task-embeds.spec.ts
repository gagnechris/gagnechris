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
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Preview' })
        .getByText(renamed, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.markdown-editor')).toBeHidden();
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
