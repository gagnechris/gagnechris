import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

// The previews frame the public page, which public-a11y checks; axe can't
// script their sandboxed frames.
async function expectNoViolations(page: Page, view: string) {
  const { violations } = await new AxeBuilder({ page })
    .options({ iframes: false })
    .analyze();
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`,
    ),
    view,
  ).toEqual([]);
}

test('axe finds nothing on Projects and the Home and Resume editors', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  test.slow();
  const project = await seed.project({ name: `${prefix} Lantern` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn();

  await page.goto(`${apps.admin}/projects`);
  await expect(page.getByText(project.name)).toBeVisible();
  await expectNoViolations(page, 'Projects');

  for (const [path, preview] of [
    ['/home', 'Home page preview'],
    ['/resume', 'Resume preview'],
  ] as const) {
    await page.goto(`${apps.admin}${path}`);
    await expect(page.getByRole('region', { name: preview })).toBeVisible();
    await expectNoViolations(page, path);
  }
});
