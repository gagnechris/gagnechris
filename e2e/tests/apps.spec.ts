import { expect, test } from '../fixtures';

test('the admin app serves the CMS from its own root, without Notebook', async ({
  page,
  apps,
  signIn,
}) => {
  await signIn();
  await page.goto(apps.admin);
  const nav = page.getByRole('navigation', { name: 'Admin' });
  await expect(nav.getByRole('link', { name: 'Posts' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(nav.getByRole('link', { name: 'Resume' })).toHaveAttribute(
    'href',
    '/resume',
  );
  await expect(nav.getByRole('link', { name: 'Notebook' })).toHaveCount(0);
  const yourApps = page.getByRole('navigation', { name: 'Your apps' });
  await expect(
    yourApps.getByRole('link', { name: /Notebook/ }),
  ).toHaveAttribute('href', `${apps.notebook}/`);
  await expect(
    yourApps.getByRole('link', { name: /Public site/ }),
  ).toHaveAttribute('target', '_blank');

  await page.goto(`${apps.admin}/today`);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

test('the Notebook app opens on Today and deep-links to its own pages', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const note = await seed.note({ title: 'Deep link target' });
  await signIn();

  await page.goto(apps.notebook);
  await expect(page).toHaveURL(`${apps.notebook}/today?area=work`);
  await expect(
    page.getByRole('button', { name: 'Jump to today' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Notebook', exact: true }),
  ).toBeVisible();

  await page.goto(`${apps.notebook}/notes`);
  await page.getByRole('link', { name: 'Deep link target' }).click();
  await expect(page).toHaveURL(`${apps.notebook}/notes/${note.id}?area=work`);

  await page.goto(`${apps.notebook}/posts`);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

test('the Notebook host answers the iPhone app sign-in return URLs without signing in', async ({
  page,
  apps,
}) => {
  for (const path of [
    '/ios/auth/callback?code=c&state=s',
    '/ios/auth/signed-out',
  ]) {
    await page.goto(`${apps.notebook}${path}`);
    await expect(
      page.getByRole('heading', { name: 'Finish in the iPhone app' }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${apps.notebook}${path}`);
  }
});

test('the public site has no admin, Notebook or sign-in pages', async ({
  page,
  apps,
}) => {
  const workspaceModules: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/src/workspace/')) {
      workspaceModules.push(request.url());
    }
  });
  for (const path of [
    '/admin',
    '/admin.html',
    '/admin/notebook/today',
    '/notebook',
    '/auth/callback',
    '/today',
  ]) {
    await page.goto(`${apps.public}${path}`);
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    await expect(page.locator('.site-header')).toBeVisible();
  }
  expect(workspaceModules).toEqual([]);
});

test('on a phone the Notebook nav is a bottom tab bar with a More sheet', async ({
  page,
  apps,
  signIn,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  const tabs = page.getByRole('navigation', { name: 'Notebook' });
  for (const name of [/^Today/, 'Notes', 'All tasks']) {
    await expect(tabs.getByRole('link', { name })).toBeVisible();
  }
  const box = await tabs.boundingBox();
  expect(box!.y + box!.height).toBeCloseTo(844, -1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await tabs.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(
    sheet.getByRole('radiogroup', { name: 'Notebook area' }),
  ).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Sign out of Notebook' }),
  ).toBeVisible();
  await tabs.getByRole('link', { name: 'Notes' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
});
