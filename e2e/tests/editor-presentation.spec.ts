import type { Locator } from '@playwright/test';
import { expect, test } from '../fixtures';

const contentPadding = (editor: Locator) =>
  editor.locator('.cm-content').evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
  });

const focusStyle = (editor: Locator) =>
  editor.evaluate((frame) => {
    const cm = frame.querySelector('.cm-editor')!;
    const s = getComputedStyle(frame);
    return {
      focused: cm.classList.contains('cm-focused'),
      outline: getComputedStyle(cm).outlineStyle,
      border: s.borderTopColor,
      ring: s.boxShadow,
    };
  });

// --primary-500
const RING = 'rgb(61, 150, 144)';

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test('the post body editor pads its content and rings its frame on focus', async ({
      page,
      apps,
      signIn,
      seed,
    }) => {
      const post = await seed.post({ bodyMarkdown: 'Hello there.' });
      await signIn();
      await page.goto(`${apps.admin}/posts/${post.id}`);
      const editor = page.locator('.markdown-editor');

      expect(await contentPadding(editor)).toEqual([
        '16px',
        '24px',
        '16px',
        '24px',
      ]);
      await editor.locator('.cm-content').click();
      await expect
        .poll(() => focusStyle(editor))
        .toMatchObject({
          focused: true,
          outline: 'none',
          border: RING,
        });
      expect((await focusStyle(editor)).ring).toContain(RING);
    });

    test('a focused note editor shows the frame ring, not a dotted outline', async ({
      page,
      apps,
      signIn,
      seed,
    }) => {
      const note = await seed.note({ bodyMarkdown: 'Plan' });
      await signIn();
      await page.goto(`${apps.notebook}/notes/${note.id}`);
      const editor = page.locator('.markdown-editor');
      await editor.locator('.cm-content').click();
      await expect
        .poll(() => focusStyle(editor))
        .toMatchObject({
          focused: true,
          outline: 'none',
          border: RING,
        });

      const hint = page.locator('.admin-hint', { hasText: 'adds a task' });
      if (name === 'phone') {
        await expect(hint).toHaveText(
          '[ ] text then Enter adds a task, @ picks its day',
        );
        await expect(hint.locator('code')).toHaveText(['[ ] text', '@']);
      } else {
        await expect(hint).toHaveCount(0);
      }
    });
  });
}
