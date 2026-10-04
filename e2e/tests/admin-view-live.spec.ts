import type { Locator } from '@playwright/test';
import { expect, requireEnv, test } from '../fixtures';

// The stack builds the admin app with the local site as its public origin.
const site = () => requireEnv('E2E_SITE_URL');

const expectPublicLink = async (link: Locator, path: string) => {
  await expect(link).toHaveAttribute('href', `${site()}${path}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
};

test('View live in every admin editor opens the public site', async ({
  page,
  apps,
  signIn,
  prefix,
  seed,
}) => {
  const post = await seed.post({ title: `${prefix} live post` });
  const { data: publishedPost } = await seed.api.POST(
    '/api/admin/posts/{id}/publish',
    { params: { path: { id: post.id } }, body: { version: post.version } },
  );
  expect(publishedPost?.status).toBe('published');

  const { data: project } = await seed.api.POST('/api/admin/projects', {
    body: {
      name: `${prefix} live project`,
      slug: `${prefix}-live-project`,
      stage: 'building',
      bodyMarkdown: 'Live.',
    },
  });
  if (!project) throw new Error('seed project failed');
  const { data: publishedProject } = await seed.api.POST(
    '/api/admin/projects/{id}/publish',
    {
      params: { path: { id: project.id } },
      body: { version: project.version },
    },
  );
  expect(publishedProject?.status).toBe('published');

  await signIn();
  const viewLive = page.getByRole('link', { name: 'View live' });

  await page.goto(`${apps.admin}/posts/${post.id}`);
  await expectPublicLink(viewLive, `/posts/${post.slug}`);
  const [livePost] = await Promise.all([
    page.waitForEvent('popup'),
    viewLive.click(),
  ]);
  await expect(livePost).toHaveURL(`${site()}/posts/${post.slug}`);
  await expect(
    livePost.getByRole('heading', { level: 1, name: post.title }),
  ).toBeVisible();
  await livePost.close();

  await page.goto(`${apps.admin}/projects/${project.id}`);
  await expectPublicLink(viewLive, `/projects/${project.slug}`);

  await page.goto(`${apps.admin}/home`);
  await expectPublicLink(viewLive, '/');

  await page.goto(`${apps.admin}/resume`);
  await expectPublicLink(viewLive, '/resume');
});
