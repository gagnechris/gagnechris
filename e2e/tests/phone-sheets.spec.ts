import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({ viewport: { width: 393, height: 852 } });

/** The open sheet sits on the bottom edge and pads its content past the home indicator. */
async function expectBottomSheet(page: Page, sheet: Locator) {
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(Math.abs(box.y + box.height - 852)).toBeLessThanOrEqual(1);
  expect(box.width).toBe(393);
  const padding = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter(
        (rule): rule is CSSStyleRule =>
          rule instanceof CSSStyleRule &&
          rule.selectorText === '.bottom-sheet__panel',
      )
      .map((rule) => rule.style.paddingBottom),
  );
  expect(padding).toContain('env(safe-area-inset-bottom, 0px)');
  await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible();
  const small = await sheet.evaluate((root) =>
    [
      ...root.querySelectorAll(
        'button, select, summary, input, textarea, [role=radio]',
      ),
    ]
      .filter((el) => el.checkVisibility())
      .map((el) => (el.matches('input') && el.closest('label')) || el)
      .filter(
        (el) =>
          (!el.matches('input, textarea') &&
            el.getBoundingClientRect().height < 44) ||
          (el.matches('input, select, textarea') &&
            parseFloat(getComputedStyle(el).fontSize) < 16),
      )
      .map(
        (el) =>
          `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)}`,
      ),
  );
  expect(small, 'controls under 44px or fields under 16px').toEqual([]);
}

test('post details open from More actions in a bottom sheet', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const post = await seed.post();
  await signIn();
  await page.goto(`${apps.admin}/posts/${post.id}`);
  await expect(page.getByLabel('Slug')).toHaveCount(0);

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Post details' }).click();
  const sheet = page.getByRole('dialog', { name: 'Post details' });
  await expectBottomSheet(page, sheet);
  await sheet.getByLabel('Excerpt').fill('Written on a phone');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'More actions' }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Post details' }).click();
  await expect(sheet.getByLabel('Excerpt')).toHaveValue('Written on a phone');
});

test('project secondary fields open in a bottom sheet', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const project = await seed.project();
  await signIn();
  await page.goto(`${apps.admin}/projects/${project.id}`);
  await expect(page.getByLabel('Pitch')).toBeVisible();
  await expect(page.getByLabel('Order')).toHaveCount(0);

  await page
    .getByRole('button', { name: 'Stack, demo, order and links' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Project details' });
  await expectBottomSheet(page, sheet);
  await expect(sheet.getByLabel('Order')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Add link' })).toBeVisible();
});

test('Invite and Edit access are bottom sheets', async ({
  page,
  apps,
  prefix,
  signIn,
}) => {
  const name = `Sheet ${prefix}`;
  await signIn();
  await page.goto(`${apps.admin}/settings/users`);
  await page.getByRole('button', { name: 'Invite user' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite user' });
  await expectBottomSheet(page, invite);
  await expect(invite.getByLabel('Name')).toBeFocused();
  await invite.getByLabel('Name').fill(name);
  await invite.getByLabel('Email').fill(`${prefix}-sheet@e2e.test`);
  await invite.getByRole('button', { name: 'Send' }).click();
  await expect(invite).toBeHidden();

  await page
    .getByRole('row')
    .filter({ hasText: `${prefix}-sheet@e2e.test` })
    .getByRole('button', { name: /^Edit/ })
    .click();
  const edit = page.getByRole('dialog', { name: `Edit access for ${name}` });
  await expectBottomSheet(page, edit);
  await expect(edit.getByRole('button', { name: 'Save' })).toBeDisabled();
  await edit.getByRole('button', { name: 'Close' }).click();
  await expect(edit).toBeHidden();
});
