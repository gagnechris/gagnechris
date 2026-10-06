import type { Page } from '@playwright/test';
import type { ResumeContent } from '@gagnechris/shared';
import { expect, focusJustBefore, requireEnv, Seed, test } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

// The resume is a singleton: one project, in order, so no other run edits it
// mid-test.
test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'edits the resume');

const owner = () =>
  new Seed(
    { userId: 'e2e-resume-owner', label: 'e2e-resume-owner@e2e.test' },
    'e2e-resume',
  );

async function publishResume(
  seed: Seed,
  edit: (content: ResumeContent) => ResumeContent,
): Promise<ResumeContent> {
  const { data: current } = await seed.api.GET('/api/admin/resume');
  if (!current) throw new Error('resume read failed');
  const content = edit(current.content);
  const { data: saved } = await seed.api.PUT('/api/admin/resume', {
    body: { version: current.version, content },
  });
  if (!saved) throw new Error('resume save failed');
  const { data: published } = await seed.api.POST('/api/admin/resume/publish', {
    body: { version: saved.version },
  });
  if (published?.status !== 'published') throw new Error('publish failed');
  return content;
}

const withCutoff =
  (earlierRolesThrough: number | undefined) =>
  ({
    headline: _headline,
    earlierRolesThrough: _cutoff,
    ...rest
  }: ResumeContent): ResumeContent => ({
    ...rest,
    headline: 'Director of Software Engineering',
    ...(earlierRolesThrough === undefined ? {} : { earlierRolesThrough }),
  });

const earlierCompanies = (page: Page) =>
  page.locator('.resume-earlier__list .resume-role__company').allTextContents();

test.describe('the resume page', () => {
  let content: ResumeContent;

  test.beforeAll(async ({ request }) => {
    content = await publishResume(owner(), withCutoff(2012));
    await expect
      .poll(async () => (await request.get(`${site()}/resume`)).text())
      .toContain('Earlier roles, 1999–2012');
  });

  test('the page source has every role, earlier ones included, and they toggle without JS', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto(`${site()}/resume`);
    const html = (await response?.text()) ?? '';
    for (const role of content.experience) {
      expect(html).toContain(role.company);
      for (const bullet of role.bullets) {
        expect(html).toContain(
          bullet.replace(/&/g, '&amp;').replace(/'/g, '&#39;'),
        );
      }
    }

    const summary = page.locator('summary.resume-earlier__summary');
    const list = page.locator('.resume-earlier__list');
    const full = page.locator('.resume-earlier__details .resume-roles');
    await expect(list).toBeVisible();
    await expect(full).toBeHidden();
    await expect(summary).toContainText('Show details');
    // Ended in the cut-off year, so it is an earlier role.
    await expect(list).toContainText('Aug 2010 – Jun 2012');

    await summary.click();
    await expect(full).toBeVisible();
    await expect(list).toBeHidden();
    await expect(summary).toContainText('Hide details');
    await expect(
      full.getByText('Developed and maintained applications.', {
        exact: false,
      }),
    ).toBeVisible();

    await summary.click();
    await expect(full).toBeHidden();
    await expect(list).toBeVisible();
    await context.close();
  });

  test('earlier roles open and close from the keyboard', async ({
    page,
    apps,
  }) => {
    await page.goto(`${apps.public}/resume`);
    const summary = page.locator('summary.resume-earlier__summary');
    const details = page.locator('details.resume-earlier__details');
    await expect(summary).toBeVisible();

    await focusJustBefore(summary);
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(details).not.toHaveAttribute('open', '');
  });

  test('at 390px the date column stacks above the role', async ({
    page,
    apps,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${apps.public}/resume`);
    const role = page.locator('.resume-roles > .resume-role').first();
    const dates = await role.locator('.resume-role__dates').boundingBox();
    const title = await role.locator('.resume-role__title').boundingBox();
    expect(dates && title).toBeTruthy();
    expect(dates!.y + dates!.height).toBeLessThanOrEqual(title!.y + 1);
    expect(Math.abs(dates!.x - title!.x)).toBeLessThan(1);

    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(wide).toBeLessThanOrEqual(390);
  });

  test('changing the cut-off and publishing moves roles', async ({
    page,
    request,
  }) => {
    const seed = owner();
    await publishResume(seed, withCutoff(2015));
    await expect
      .poll(async () => (await request.get(`${site()}/resume`)).text())
      .toContain('Earlier roles, 1999–2015');
    await page.goto(`${site()}/resume`);
    expect(await earlierCompanies(page)).toContain('at Getty Images');

    await publishResume(seed, withCutoff(undefined));
    await expect
      .poll(async () => (await request.get(`${site()}/resume`)).text())
      .not.toContain('resume-earlier');
    await page.goto(`${site()}/resume`);
    await expect(
      page.locator('[aria-labelledby="resume-experience"] .resume-role'),
    ).toHaveCount(content.experience.length);
  });
});
