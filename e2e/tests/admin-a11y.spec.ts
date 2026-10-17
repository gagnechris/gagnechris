import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

// The previews frame the public page, which public-a11y checks. Legacy mode
// runs axe in this page alone: the default merges frame results in a new
// blank page, whose creation hung on CI beside the sandboxed preview frames.
async function expectNoViolations(page: Page, view: string) {
  const { violations } = await new AxeBuilder({ page })
    .setLegacyMode()
    .options({ iframes: false })
    .analyze();
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`,
    ),
    view,
  ).toEqual([]);
}

test.beforeEach(async ({ page, signIn }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn();
});

test('axe finds nothing on Projects', async ({ page, apps, seed, prefix }) => {
  const project = await seed.project({ name: `${prefix} Lantern` });
  await page.goto(`${apps.admin}/projects`);
  await expect(page.getByText(project.name)).toBeVisible();
  await expectNoViolations(page, 'Projects');
});

for (const path of ['/home', '/resume']) {
  test(`axe finds nothing on the ${path} editor`, async ({ page, apps }) => {
    await page.goto(`${apps.admin}${path}`);
    await expect(page.locator('iframe.admin-page-preview')).toBeVisible();
    await expectNoViolations(page, path);
  });
}
