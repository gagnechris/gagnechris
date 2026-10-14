import { expect, test } from '../fixtures';

// A 1×1 PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/eL9GtQAAAABJRU5ErkJggg==';

test('a pasted image shows in the note and is still there after reload', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const note = await seed.note({ bodyMarkdown: 'Screenshot:' });
  await signIn();
  await page.goto(`${apps.notebook}/notes/${note.id}`);
  const body = page.getByRole('textbox', { name: 'Note body' });
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');

  await body.evaluate((el, base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    el.dispatchEvent(event);
  }, PNG);

  const image = page.locator('.markdown-editor img.cm-md-image');
  await expect(image).toHaveAttribute('src', `data:image/png;base64,${PNG}`);
  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/notes/{id}', {
        params: { path: { id: note.id } },
      });
      return data?.bodyMarkdown;
    })
    .toMatch(
      /^Screenshot:\n!\[image\]\(notebook-image:[0-9a-f]{16}\.png\)\n\n$/,
    );

  await page.reload();
  await expect(image).toHaveAttribute('src', `data:image/png;base64,${PNG}`);
});
