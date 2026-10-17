import type { APIRequestContext, Page } from '@playwright/test';
import { afterFrames, expect, requireEnv, test, type Seed } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

const saved = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();

const titleInput = (page: Page) => page.getByRole('textbox', { name: 'Title' });

const publicPage = async (request: APIRequestContext, slug: string) => {
  const response = await request.get(`${site()}/posts/${slug}`);
  return { status: response.status(), text: await response.text() };
};

const stored = async (seed: Seed, id: string) => {
  const { data } = await seed.api.GET('/api/admin/posts/{id}', {
    params: { path: { id } },
  });
  return data;
};

const openPost = async (
  page: Page,
  admin: string,
  id: string,
  title: string,
) => {
  await page.goto(`${admin}/posts/${id}`);
  await expect(titleInput(page)).toHaveValue(title);
};

test('a new post: type, autosave, reload, Publish, and it is on the site', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
  request,
}) => {
  // Saves wait until the test has seen Saving…; a polled assertion can miss
  // a fixed-length window between two polls.
  let releaseSaves!: () => void;
  const savesReleased = new Promise<void>((resolve) => {
    releaseSaves = resolve;
  });
  await page.route('**/api/admin/posts/*', async (route) => {
    if (route.request().method() === 'PUT') await savesReleased;
    await route.continue();
  });
  await signIn();
  await page.goto(`${apps.admin}/posts`);
  await page.getByRole('button', { name: 'New post' }).click();
  await expect(page).toHaveURL(/\/posts\/[0-9A-Z]{26}$/);
  const id = page.url().split('/').at(-1)!;

  const title = `${prefix} New post`;
  const body = `Written in the editor by ${prefix}.`;
  await titleInput(page).fill(title);
  await page.locator('.markdown-editor .cm-content').click();
  await page.keyboard.type(body);
  await expect(
    page.getByRole('status').filter({ hasText: /^Saving/ }),
  ).toBeVisible();
  releaseSaves();
  await saved(page);
  expect(await stored(seed, id)).toMatchObject({
    title,
    bodyMarkdown: body,
    status: 'draft',
  });

  await page.reload();
  await expect(titleInput(page)).toHaveValue(title);
  await expect(page.locator('.markdown-editor .cm-content')).toHaveText(body);

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();
  const { slug } = (await stored(seed, id))!;
  await expect
    .poll(async () => (await publicPage(request, slug)).text)
    .toContain(body);
});

test('an edit to a published post stays off the site until Publish changes', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
  request,
}) => {
  const post = await seed.publishedPost({ title: `${prefix} Before` });
  await signIn();
  await openPost(page, apps.admin, post.id, post.title);

  await titleInput(page).fill(`${prefix} After`);
  await saved(page);
  expect(await stored(seed, post.id)).toMatchObject({
    title: `${prefix} After`,
    hasUnpublishedChanges: true,
  });
  const live = await publicPage(request, post.slug);
  expect(live.text).toContain(`${prefix} Before`);
  expect(live.text).not.toContain(`${prefix} After`);

  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(
    page.getByRole('button', { name: 'Publish changes' }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await publicPage(request, post.slug)).text)
    .toContain(`${prefix} After`);
});

test('Discard changes brings back the published post', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
  request,
}) => {
  const post = await seed.publishedPost({ title: `${prefix} Published` });
  await signIn();
  await openPost(page, apps.admin, post.id, post.title);

  await titleInput(page).fill(`${prefix} Draft`);
  await saved(page);
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(titleInput(page)).toHaveValue(`${prefix} Published`);
  await expect(
    page.getByRole('button', { name: 'Discard changes' }),
  ).toHaveCount(0);
  expect(await stored(seed, post.id)).toMatchObject({
    title: `${prefix} Published`,
    hasUnpublishedChanges: false,
  });
  expect((await publicPage(request, post.slug)).text).toContain(
    `${prefix} Published`,
  );
});

test('a draft slug rename keeps View live on the live slug, and Discard brings the slug back', async ({
  page,
  apps,
  signIn,
  seed,
  request,
}) => {
  const post = await seed.publishedPost();
  await signIn();
  await openPost(page, apps.admin, post.id, post.title);

  const draftSlug = `${post.slug}-draft`;
  await page.getByText('Details', { exact: true }).click();
  await page.getByLabel(/^Slug/).fill(draftSlug);
  await saved(page);
  expect(await stored(seed, post.id)).toMatchObject({
    slug: draftSlug,
    publishedSlug: post.slug,
  });
  await expect(page.getByRole('link', { name: 'View live' })).toHaveAttribute(
    'href',
    `${site()}/posts/${post.slug}`,
  );
  expect((await publicPage(request, post.slug)).status).toBe(200);
  expect((await publicPage(request, draftSlug)).status).toBe(404);

  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page.getByLabel(/^Slug/)).toHaveValue(post.slug);
  const restored = await stored(seed, post.id);
  expect(restored).toMatchObject({
    slug: post.slug,
    hasUnpublishedChanges: false,
  });
  expect(restored?.publishedSlug).toBeUndefined();
  expect((await publicPage(request, post.slug)).status).toBe(200);
});

test('a too-large body says so, and Leave without saving drops it', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const post = await seed.post({
    title: `${prefix} Too large`,
    bodyMarkdown: 'Small.',
  });
  await signIn();
  await openPost(page, apps.admin, post.id, post.title);

  const body = page.locator('.markdown-editor .cm-content');
  await body.click();
  // Over DynamoDB's 400 KB item limit, pasted because typing it takes minutes.
  await body.evaluate(
    (el, text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    `${'x'.repeat(99)}\n`.repeat(4_200),
  );
  await page.keyboard.press('ControlOrMeta+S');
  await expect(page.getByRole('alert')).toContainText('Too large to save');

  const puts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT') puts.push(req.url());
  });
  await page.getByRole('link', { name: '← Posts' }).click();
  const leave = page.getByRole('alertdialog');
  await expect(leave).toContainText('Leave without saving?');
  await leave.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(`${apps.admin}/`);
  const putsAtLeave = puts.length;

  await page.getByRole('link', { name: post.title }).click();
  await expect(titleInput(page)).toHaveValue(post.title);
  await expect(body).toHaveText('Small.');
  await expect(page.getByText('Too large to save')).toHaveCount(0);
  expect(puts).toHaveLength(putsAtLeave);
  expect((await stored(seed, post.id))?.bodyMarkdown).toBe('Small.');
});

test('Unpublish takes the post off the site; Delete removes it', async ({
  page,
  apps,
  signIn,
  seed,
  request,
}) => {
  const post = await seed.publishedPost();
  expect((await publicPage(request, post.slug)).status).toBe(200);
  await signIn();
  await openPost(page, apps.admin, post.id, post.title);

  await page.getByRole('button', { name: 'Unpublish' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Unpublish' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Publish', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await publicPage(request, post.slug)).status)
    .toBe(404);

  await page.getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page).toHaveURL(`${apps.admin}/`);
  await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
  await expect(page.getByRole('link', { name: post.title })).toHaveCount(0);
  const { response } = await seed.api.GET('/api/admin/posts/{id}', {
    params: { path: { id: post.id } },
  });
  expect(response.status).toBe(404);
});

test('a taken slug shows the slug-taken message and keeps the old slug', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const taken = `${prefix}-taken`;
  await seed.post({ slug: taken });
  const post = await seed.post();
  await signIn();
  await openPost(page, apps.admin, post.id, post.title);

  await page.getByText('Details', { exact: true }).click();
  await page.getByLabel(/^Slug/).fill(taken);
  await page.keyboard.press('ControlOrMeta+S');
  await expect(
    page.getByText('That slug is already taken. Choose a different slug.'),
  ).toBeVisible();
  await expect(page.getByText(/Conflict/)).toHaveCount(0);
  expect((await stored(seed, post.id))?.slug).toBe(post.slug);
});

test('two tabs: the second save is a conflict and never overwrites the first', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const post = await seed.post({ title: `${prefix} Start` });
  await signIn();
  const tabA = page;
  const tabB = await page.context().newPage();
  await openPost(tabA, apps.admin, post.id, post.title);
  await openPost(tabB, apps.admin, post.id, post.title);

  await titleInput(tabA).fill(`${prefix} From A`);
  await saved(tabA);

  await titleInput(tabB).fill(`${prefix} From B`);
  await tabB.keyboard.press('ControlOrMeta+S');
  await expect(tabB.getByRole('alert')).toContainText(
    'Conflict — another save updated this post. Reload and try again.',
  );
  expect((await stored(seed, post.id))?.title).toBe(`${prefix} From A`);
});

test('⌘⏎ in the body neither adds a line nor publishes', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  const post = await seed.post({ bodyMarkdown: 'One line.' });
  const publishes: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/publish'))
      publishes.push(req.url());
  });
  await signIn();
  await openPost(page, apps.admin, post.id, post.title);

  const content = page.locator('.markdown-editor .cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+Enter');
  await afterFrames(page);
  await expect(content.locator('.cm-line')).toHaveCount(1);
  await expect(content).toHaveText('One line.');

  // A save after it proves the keypress was handled and sent nothing.
  await page.keyboard.type(' More.');
  await page.keyboard.press('ControlOrMeta+S');
  await saved(page);
  expect(await stored(seed, post.id)).toMatchObject({
    bodyMarkdown: 'One line. More.',
    status: 'draft',
  });
  expect(publishes).toEqual([]);
});

test.describe('leaving with unsaved changes', () => {
  test('saves first, then leaves without asking', async ({
    page,
    apps,
    signIn,
    seed,
    prefix,
  }) => {
    const post = await seed.post();
    await signIn();
    await openPost(page, apps.admin, post.id, post.title);

    await titleInput(page).fill(`${prefix} Typed then left`);
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Projects' })
      .click();
    await expect(page).toHaveURL(/\/projects$/);
    expect((await stored(seed, post.id))?.title).toBe(
      `${prefix} Typed then left`,
    );
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('asks when the save fails, and staying keeps the edit', async ({
    page,
    apps,
    signIn,
    seed,
    prefix,
  }) => {
    const post = await seed.post();
    await page.route(`**/api/admin/posts/${post.id}`, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, body: '{}' })
        : route.continue(),
    );
    await signIn();
    await openPost(page, apps.admin, post.id, post.title);

    await titleInput(page).fill(`${prefix} Unsaved`);
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Projects' })
      .click();
    const dialog = page.getByRole('alertdialog', {
      name: 'Your changes could not be saved. Leave without saving?',
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${post.id}$`));
    await expect(titleInput(page)).toHaveValue(`${prefix} Unsaved`);
    expect((await stored(seed, post.id))?.title).toBe(post.title);
  });
});

test.describe('Home', () => {
  // Home is a singleton: only one browser edits it, so runs never race.
  test.skip(({ browserName }) => browserName !== 'chromium', 'edits Home');

  test('an About Me edit published from the editor is on the home page', async ({
    page,
    apps,
    signIn,
    prefix,
    request,
  }) => {
    await signIn();
    await page.goto(`${apps.admin}/home`);
    const about = page.getByRole('textbox', { name: /^About Me/ });
    await expect(about).not.toHaveValue('');
    const line = `Edited by ${prefix}.`;
    await about.fill(`${await about.inputValue()}\n\n${line}`);
    await saved(page);
    expect(await (await request.get(`${site()}/`)).text()).not.toContain(line);

    await page.getByRole('button', { name: /^Publish( changes)?$/ }).click();
    await expect
      .poll(async () => (await request.get(`${site()}/`)).text())
      .toContain(line);
  });
});
