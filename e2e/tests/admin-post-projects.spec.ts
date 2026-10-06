import { expect, requireEnv, test } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

test('tag a post with a project from the editor; the post shows Part of and the project lists it', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
  request,
}) => {
  const name = `${prefix} Notebook`;
  const slug = `${prefix}-notebook`;
  await seed.publishedProject({
    name,
    slug,
    bodyMarkdown: 'Body.',
  });
  const post = await seed.post({ title: `${prefix} Build log entry` });

  page.on('dialog', (dialog) => void dialog.accept());
  await signIn();
  await page.goto(`${apps.admin}/posts/${post.id}`);
  await page.getByText('Details', { exact: true }).click();

  const group = page.getByRole('group', { name: 'Part of project' });
  const box = group.getByRole('checkbox', { name: `${name} · Building` });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  // Autosave, not the Save button: once autosave lands, Save is disabled.
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  await expect
    .poll(async () => (await request.get(`${site()}/projects/${slug}`)).text())
    .toContain(
      `<a class="project-build-log__link" href="/posts/${post.slug}"><h3 class="project-build-log__title">${post.title}</h3>`,
    );

  await page.goto(`${site()}/posts/${post.slug}`);
  const partOf = page.locator('.post-part-of');
  await expect(partOf).toHaveText(`Part of the ${name} project`);
  await expect(partOf.getByRole('link', { name })).toHaveAttribute(
    'href',
    `/projects/${slug}`,
  );

  await page.goto(`${site()}/projects/${slug}`);
  await expect(
    page.getByRole('region', { name: 'Build log' }).getByRole('link', {
      name: post.title,
    }),
  ).toBeVisible();
});
