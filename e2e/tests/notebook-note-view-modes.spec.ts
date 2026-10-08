import { expect, test, type Seed } from '../fixtures';
import type { Page } from '@playwright/test';

const BODY = ['## Plan', '', '**Ship** it', '', '- one', '- two'].join('\n');

const savedBody = (seed: Seed, id: string) => async () => {
  const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
    params: { path: { id } },
  });
  return data?.bodyMarkdown;
};

function controls(page: Page) {
  return {
    editor: page.getByRole('textbox', { name: 'Note body' }),
    preview: page.getByRole('region', { name: 'Preview' }),
    markdown: page.getByRole('button', { name: 'Markdown' }),
    previewButton: page.getByRole('button', { name: 'Preview' }),
  };
}

test('Markdown and Preview each switch on the first click, from any mode', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({
    title: `${prefix} modes`,
    bodyMarkdown: BODY,
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  const { editor, preview, markdown, previewButton } = controls(page);

  await expect(editor).toContainText('Ship it');
  await expect(markdown).toHaveAttribute('aria-pressed', 'false');

  await markdown.click();
  await expect(markdown).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toContainText('**Ship** it');
  await expect(editor).toBeFocused();

  await previewButton.click();
  await expect(
    preview.getByRole('heading', { level: 2, name: 'Plan' }),
  ).toBeVisible();
  await expect(editor).toBeHidden();
  await expect(preview).toBeFocused();

  await markdown.click();
  await expect(preview).toBeHidden();
  await expect(editor).toContainText('**Ship** it');
  await expect(editor).toBeFocused();
  await expect(previewButton).toHaveAttribute('aria-pressed', 'false');

  await markdown.click();
  await expect(markdown).toHaveAttribute('aria-pressed', 'false');
  await previewButton.click();
  await expect(preview.getByRole('listitem')).toHaveText(['one', 'two']);
  await markdown.click();
  await expect(markdown).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toContainText('- one');

  await page.reload();
  await expect(controls(page).markdown).toHaveAttribute('aria-pressed', 'true');
  await expect(controls(page).editor).toContainText('**Ship** it');
});

test('text typed just before ⌘/ shows in Preview, and the caret is where it was after', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({
    title: `${prefix} typing`,
    bodyMarkdown: BODY,
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  const { editor, preview } = controls(page);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('three');
  await page.keyboard.press('ControlOrMeta+/');
  await expect(preview.getByRole('listitem')).toHaveText([
    'one',
    'two',
    'three',
  ]);
  await expect(preview).toBeFocused();

  await page.keyboard.press('ControlOrMeta+/');
  await expect(editor).toBeFocused();
  await page.keyboard.type(' and four');
  await expect.poll(savedBody(seed, note.id)).toBe(`${BODY}\n- three and four`);
});

test('rapid toggling settles on the last mode with the text intact', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.note({
    title: `${prefix} rapid`,
    bodyMarkdown: BODY,
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  const { editor, preview, markdown, previewButton } = controls(page);
  await expect(editor).toContainText('Ship it');

  // Three clicks inside one task: faster than any person, and faster than
  // the preview chunk can load on a cold page.
  await previewButton.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(preview.getByRole('heading', { name: 'Plan' })).toBeVisible();
  await expect(previewButton).toHaveAttribute('aria-pressed', 'true');

  await previewButton.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(preview).toBeVisible();

  for (let i = 0; i < 3; i += 1) await markdown.click();
  await expect(preview).toBeHidden();
  await expect(markdown).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toContainText('**Ship** it');
  await expect(page.getByText('Loading preview…')).toHaveCount(0);
  expect(await savedBody(seed, note.id)()).toBe(BODY);
});

test('⌘/ in a long note keeps the reader’s place in Preview and back', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const lines = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}`);
  const note = await seed.note({
    title: `${prefix} long`,
    bodyMarkdown: lines.join('\n\n'),
  });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  const { editor, preview } = controls(page);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  const caretLine = page.locator('.markdown-editor .cm-activeLine');
  await expect(caretLine).toHaveText('Line 120');
  await expect(caretLine).toBeInViewport();

  await page.keyboard.press('ControlOrMeta+/');
  await expect(preview.getByText('Line 120', { exact: true })).toBeInViewport();

  await page.keyboard.press('ControlOrMeta+/');
  await expect(caretLine).toHaveText('Line 120');
  await expect(caretLine).toBeInViewport();
  await page.keyboard.type('!');
  await expect(caretLine).toHaveText('Line 120!');
});
