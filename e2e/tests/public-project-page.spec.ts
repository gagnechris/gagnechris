import type { APIRequestContext, Page } from '@playwright/test';
import { expect, requireEnv, test, type Seed } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

type ProjectBody = {
  name: string;
  slug: string;
  stage: 'building' | 'live';
  pitch?: string;
  bodyMarkdown: string;
  stack?: string[];
  demo?: 'posts' | 'notebook';
  previewImage?: string;
};

async function publishProject(seed: Seed, body: ProjectBody): Promise<string> {
  const { data: created, error } = await seed.api.POST('/api/admin/projects', {
    body,
  });
  if (!created)
    throw new Error(`seed project failed: ${JSON.stringify(error)}`);
  const { data: published } = await seed.api.POST(
    '/api/admin/projects/{id}/publish',
    {
      params: { path: { id: created.id } },
      body: { version: created.version },
    },
  );
  if (published?.status !== 'published') throw new Error('publish failed');
  return created.id;
}

async function publishTaggedPost(
  seed: Seed,
  title: string,
  slug: string,
  projectId: string,
): Promise<void> {
  const { data: created } = await seed.api.POST('/api/admin/posts', {
    body: { title, slug, bodyMarkdown: 'Tagged.', projectIds: [projectId] },
  });
  if (!created) throw new Error('seed post failed');
  const { data: published } = await seed.api.POST(
    '/api/admin/posts/{id}/publish',
    {
      params: { path: { id: created.id } },
      body: { version: created.version },
    },
  );
  if (published?.status !== 'published') throw new Error('publish failed');
}

/** Survives client navigation, not a document load. */
const markDocument = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { sameDocument: boolean }).sameDocument = true;
  });
const sameDocument = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { sameDocument?: boolean }).sameDocument,
  );

const BODY = [
  '## Why I built it',
  '',
  'Because.',
  '',
  '## How publishing works',
  '',
  '1. I write in markdown.',
  '2. Publishing writes to DynamoDB.',
].join('\n');

test.describe('a project page', () => {
  let slug: string;
  let first: string;
  let second: string;
  let name: string;

  test.beforeEach(async ({ seed, prefix, request }) => {
    name = `Project ${prefix}`;
    slug = `${prefix}-project`;
    first = `${prefix}-first`;
    second = `${prefix}-second`;
    const id = await publishProject(seed, {
      name,
      slug,
      stage: 'live',
      pitch: 'A pitch.',
      bodyMarkdown: BODY,
      stack: ['React', 'DynamoDB'],
    });
    await publishTaggedPost(seed, `First ${prefix}`, first, id);
    await publishTaggedPost(seed, `Second ${prefix}`, second, id);
    // Parallel tests rebuild the local site too; wait for both Build log entries.
    await expect
      .poll(async () =>
        (await request.get(`${site()}/projects/${slug}`)).text(),
      )
      .toContain(`href="/posts/${first}"`);
  });

  for (const [label, origin] of [
    ['the built site', site],
    ['the Vite dev server', () => requireEnv('E2E_PUBLIC_URL')],
  ] as const) {
    test(`on ${label}: post → Part of → project → Build log entry → Back, all client-side`, async ({
      page,
    }) => {
      await page.goto(`${origin()}/posts/${first}`);
      await expect(page.locator('.post-part-of')).toHaveText(
        `Part of the ${name} project`,
      );
      await markDocument(page);

      await page.locator('.post-part-of').getByRole('link', { name }).click();
      await expect(page).toHaveURL(`${origin()}/projects/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      const log = page.getByRole('region', { name: 'Build log' });
      await expect(log.getByRole('link')).toHaveText([
        new RegExp(`^Second ${prefixOf(slug)}`),
        new RegExp(`^First ${prefixOf(slug)}`),
      ]);
      await expect(page.locator('.project-body ol > li')).toHaveCount(2);
      await expect(page.getByText('Page not found')).toHaveCount(0);

      await log.getByRole('link', { name: new RegExp(`^First `) }).click();
      await expect(page).toHaveURL(`${origin()}/posts/${first}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `First ${prefixOf(slug)}`,
      );

      await page.goBack();
      await expect(page).toHaveURL(`${origin()}/projects/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      expect(await sameDocument(page)).toBe(true);
    });
  }

  test('loads only the entry’s static JS (from the build manifest) when it has no demo', async ({
    page,
    request,
  }) => {
    const manifest = (await (
      await request.get(`${site()}/.vite/manifest.json`)
    ).json()) as Record<
      string,
      { file: string; isEntry?: boolean; imports?: string[] }
    >;
    const entryKey = Object.keys(manifest).find((k) => manifest[k]!.isEntry)!;
    const allowed = new Set<string>();
    const queue = [entryKey];
    while (queue.length) {
      const key = queue.pop()!;
      const chunk = manifest[key]!;
      if (allowed.has(`/${chunk.file}`)) continue;
      allowed.add(`/${chunk.file}`);
      queue.push(...(chunk.imports ?? []));
    }

    const scripts: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() === 'script') {
        const url = new URL(req.url());
        if (url.origin === new URL(site()).origin) scripts.push(url.pathname);
      }
    });
    await page.goto(`${site()}/projects/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await page.waitForLoadState('networkidle');

    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((s) => !allowed.has(s))).toEqual([]);
    await expect(page.locator('.project-demo')).toHaveCount(0);
  });
});

test.describe('the Try it slot', () => {
  test('with JavaScript off it shows the preview image; a project with no demo has no slot', async ({
    browser,
    seed,
    prefix,
    request,
  }) => {
    await publishProject(seed, {
      name: `Demo ${prefix}`,
      slug: `${prefix}-demo`,
      stage: 'building',
      bodyMarkdown: BODY,
      demo: 'notebook',
      previewImage: `/media/projects/${prefix}.png`,
    });
    await publishProject(seed, {
      name: `Plain ${prefix}`,
      slug: `${prefix}-plain`,
      stage: 'building',
      bodyMarkdown: BODY,
      previewImage: `/media/projects/${prefix}-plain.png`,
    });
    await expect
      .poll(async () =>
        (await request.get(`${site()}/projects/${prefix}-plain`)).status(),
      )
      .toBe(200);

    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${site()}/projects/${prefix}-demo`);
    const slot = page.getByRole('region', { name: 'Try it' });
    await expect(slot).toBeVisible();
    await expect(slot.locator('img')).toHaveAttribute(
      'src',
      `/media/projects/${prefix}.png`,
    );
    expect((await slot.boundingBox())!.width).toBeGreaterThan(720);
    await expect(page.getByRole('region', { name: 'Build log' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(slot.locator('img')).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);

    await page.goto(`${site()}/projects/${prefix}-plain`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `Plain ${prefix}`,
    );
    await expect(page.locator('.project-demo')).toHaveCount(0);
    await expect(page.getByText('Try it')).toHaveCount(0);
    await context.close();
  });
});

test.describe('a demo in the Try it slot', () => {
  const GA = /^https:\/\/(?:www\.)?(?:googletagmanager|google-analytics)\.com$/;
  const FIXTURE = '/src/__tests__/fixtures/demo/FixtureDemo.tsx';

  test('loads near the viewport, runs without the API or other origins, and resets from the keyboard', async ({
    page,
    seed,
    prefix,
    request,
    browserName,
  }) => {
    // Safari moves focus only between text fields on plain Tab.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const origin = requireEnv('E2E_PUBLIC_URL');
    const slug = `${prefix}-fixture`;
    await publishProject(seed, {
      name: `Fixture ${prefix}`,
      slug,
      stage: 'live',
      bodyMarkdown: BODY,
      demo: 'notebook',
      previewImage: `/media/projects/${prefix}.png`,
    });
    await expect
      .poll(async () =>
        (await request.get(`${site()}/projects/${slug}`)).status(),
      )
      .toBe(200);

    const requests: URL[] = [];
    page.on('request', (req) => requests.push(new URL(req.url())));
    await page.setViewportSize({ width: 1280, height: 120 });
    await page.goto(`${origin}/projects/${slug}`);
    const slot = page.getByRole('region', { name: 'Try it' });
    await expect(slot.locator('img')).toHaveAttribute(
      'src',
      `/media/projects/${prefix}.png`,
    );
    await page.waitForLoadState('networkidle');
    expect(requests.some((u) => u.pathname === FIXTURE)).toBe(false);

    await slot.scrollIntoViewIfNeeded();
    await page.setViewportSize({ width: 1280, height: 900 });
    const reset = slot.getByRole('button', { name: 'Reset' });
    await expect(reset).toBeVisible();
    expect(requests.some((u) => u.pathname === FIXTURE)).toBe(true);
    await expect(slot.locator('img')).toHaveCount(0);
    await expect(
      slot.getByText('Sample data, runs in your browser, nothing is saved'),
    ).toBeVisible();
    expect(
      await slot
        .locator('.demo-frame')
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toMatch(/^Inter\b/);

    const fromInteraction = requests.length;
    const add = slot.getByRole('textbox', { name: /Add a task/ });
    const open = slot.getByRole('checkbox', {
      name: 'Complete Seeded open task',
    });
    await reset.focus();
    await page.keyboard.press(tab);
    await expect(add).toBeFocused();
    await page.keyboard.type('Call Sam !high');
    await page.keyboard.press('Enter');
    await expect(
      slot.getByRole('checkbox', { name: 'Complete Call Sam' }),
    ).toBeVisible();
    await page.keyboard.press(tab);
    await expect(slot.getByRole('button', { name: 'Add' })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(open).toBeFocused();
    await page.keyboard.press('Space');
    await expect(
      slot.getByRole('checkbox', { name: 'Reopen Seeded open task' }),
    ).toBeChecked();

    for (let i = 0; i < 3; i++) await page.keyboard.press(`Shift+${tab}`);
    await expect(reset).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(slot.getByRole('checkbox')).toHaveCount(2);
    await expect(open).not.toBeChecked();
    await expect(
      slot.getByRole('checkbox', { name: 'Reopen Seeded done task' }),
    ).toBeChecked();
    await expect(add).toHaveValue('');
    await page.waitForLoadState('networkidle');

    const pageOrigin = new URL(origin).origin;
    expect(requests.filter((u) => u.pathname.startsWith('/api/'))).toEqual([]);
    expect(
      requests
        .filter((u) => u.origin !== pageOrigin && !GA.test(u.origin))
        .map(String),
    ).toEqual([]);
    expect(
      requests
        .slice(fromInteraction)
        .filter((u) => u.origin === pageOrigin)
        .map(String),
    ).toEqual([]);
  });
});

test.describe('the Posts demo on the built site', () => {
  const GA = /^https:\/\/(?:www\.)?(?:googletagmanager|google-analytics)\.com$/;
  const DEMO = 'src/demos/posts/index.tsx';
  const CODEMIRROR = 'src/kit/markdown/MarkdownEditor.tsx';

  type Manifest = Record<
    string,
    { file: string; imports?: string[]; dynamicImports?: string[] }
  >;

  const staticFiles = (manifest: Manifest, key: string): Set<string> => {
    const files = new Set<string>();
    const queue = [key];
    while (queue.length) {
      const chunk = manifest[queue.pop()!]!;
      if (files.has(`/${chunk.file}`)) continue;
      files.add(`/${chunk.file}`);
      queue.push(...(chunk.imports ?? []));
    }
    return files;
  };

  const publishPostsDemo = async (
    seed: Seed,
    prefix: string,
    request: APIRequestContext,
  ) => {
    const slug = `${prefix}-posts-demo`;
    await publishProject(seed, {
      name: `Posts ${prefix}`,
      slug,
      stage: 'live',
      bodyMarkdown: BODY,
      demo: 'posts',
      previewImage: `/media/projects/${prefix}.png`,
    });
    await expect
      .poll(async () =>
        (await request.get(`${site()}/projects/${slug}`)).status(),
      )
      .toBe(200);
    return slug;
  };

  test('lazy-loads CodeMirror, keeps the live copy until Publish, renders sanitised markup, and makes no /api requests', async ({
    page,
    seed,
    prefix,
    request,
  }) => {
    const manifest = (await (
      await request.get(`${site()}/.vite/manifest.json`)
    ).json()) as Manifest;
    // CodeMirror is its own chunk behind the demo, not part of it.
    expect(manifest[CODEMIRROR], 'CodeMirror chunk').toBeDefined();
    expect(manifest[DEMO]!.dynamicImports).toContain(CODEMIRROR);
    const demoFile = `/${manifest[DEMO]!.file}`;
    const editorFile = `/${manifest[CODEMIRROR]!.file}`;
    expect(staticFiles(manifest, DEMO).has(editorFile)).toBe(false);
    expect(staticFiles(manifest, 'index.html').has(editorFile)).toBe(false);

    const slug = await publishPostsDemo(seed, prefix, request);
    const requests: URL[] = [];
    page.on('request', (req) => requests.push(new URL(req.url())));
    page.on('dialog', (dialog) => {
      throw new Error(`a script ran: ${dialog.message()}`);
    });
    await page.setViewportSize({ width: 1280, height: 120 });
    await page.goto(`${site()}/projects/${slug}`);
    const slot = page.getByRole('region', { name: 'Try it' });
    await expect(slot.locator('img')).toHaveAttribute(
      'src',
      `/media/projects/${prefix}.png`,
    );
    await page.waitForLoadState('networkidle');
    const fetched = (path: string) => requests.some((u) => u.pathname === path);
    expect(fetched(demoFile)).toBe(false);
    expect(fetched(editorFile)).toBe(false);

    await slot.scrollIntoViewIfNeeded();
    await page.setViewportSize({ width: 1280, height: 1000 });
    const editor = slot.getByRole('region', { name: 'Editor' });
    const publicSite = slot.getByRole('region', { name: 'Public site' });
    const body = editor.getByRole('textbox', { name: 'Body' });
    await expect(body).toBeVisible();
    expect(fetched(demoFile)).toBe(true);
    expect(fetched(editorFile)).toBe(true);

    const note = slot.getByText(
      'Write on the left, publish, watch the right. Nothing is saved.',
    );
    const label = slot.getByRole('heading', { name: 'Try it' });
    expect(
      Math.abs((await note.boundingBox())!.y - (await label.boundingBox())!.y),
    ).toBeLessThan(4);
    const caption = slot.locator('.posts-demo__caption');
    await expect(caption).toHaveText(/^Draft: only the editor sees it/);
    await expect(publicSite.locator('.home-post__title')).toHaveText([
      'Welcome',
    ]);

    const fromInteraction = requests.length;
    await body.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(
      '\n\nSafe <script>alert(1)</script> and [a link](javascript:alert(2)).',
    );
    await editor.getByRole('button', { name: 'Publish' }).click();
    await expect(caption).toHaveText(/^Published\. In the real system/);
    await expect(publicSite.locator('.home-post__title')).toHaveText([
      'Hello from the demo',
      'Welcome',
    ]);
    await publicSite.getByRole('button', { name: 'Post page' }).click();
    const article = publicSite.locator(
      '.post-page article.blog-post-prerender',
    );
    await expect(article.getByRole('heading', { level: 1 })).toHaveText(
      'Hello from the demo',
    );
    await expect(article.locator('.post-content h2')).toHaveText(
      'What happens next',
    );
    await expect(article.locator('.post-content')).toContainText('Safe');
    await expect(article.locator('script')).toHaveCount(0);
    await expect(
      article.getByText('a link', { exact: true }),
    ).not.toHaveAttribute('href');
    expect(
      await article.evaluate((el) => getComputedStyle(el).fontFamily),
    ).toMatch(/^Newsreader\b/);

    const title = editor.getByRole('textbox', { name: /^Title/ });
    await title.fill('Hello again');
    await expect(editor.getByText('Unpublished changes')).toBeVisible();
    await expect(caption).toHaveText(/^Unpublished changes/);
    await expect(article.getByRole('heading', { level: 1 })).toHaveText(
      'Hello from the demo',
    );
    await editor.getByRole('button', { name: 'Publish changes' }).click();
    await expect(article.getByRole('heading', { level: 1 })).toHaveText(
      'Hello again',
    );
    await expect(editor.getByText('Unpublished changes')).toHaveCount(0);

    await slot.getByRole('button', { name: 'Reset' }).click();
    await expect(caption).toHaveText(/^Draft/);
    await expect(title).toHaveValue('Hello from the demo');
    await page.waitForLoadState('networkidle');

    const pageOrigin = new URL(site()).origin;
    expect(requests.filter((u) => u.pathname.startsWith('/api/'))).toEqual([]);
    expect(
      requests
        .filter((u) => u.origin !== pageOrigin && !GA.test(u.origin))
        .map(String),
    ).toEqual([]);
    // Fonts for a weight the page hadn't used yet are the only fetches left.
    expect(
      requests
        .slice(fromInteraction)
        .filter(
          (u) => u.origin === pageOrigin && !u.pathname.endsWith('.woff2'),
        )
        .map(String),
    ).toEqual([]);
  });

  test('on a phone the panes stack, editor first, with no sideways scroll', async ({
    page,
    seed,
    prefix,
    request,
  }) => {
    const slug = await publishPostsDemo(seed, prefix, request);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${site()}/projects/${slug}`);
    const slot = page.getByRole('region', { name: 'Try it' });
    await slot.scrollIntoViewIfNeeded();
    const editor = slot.getByRole('region', { name: 'Editor' });
    const publicSite = slot.getByRole('region', { name: 'Public site' });
    await expect(editor.getByRole('textbox', { name: 'Body' })).toBeVisible();
    await expect(
      slot.getByText(
        'Write on the left, publish, watch the right. Nothing is saved.',
      ),
    ).toBeVisible();

    const e = (await editor.boundingBox())!;
    const p = (await publicSite.boundingBox())!;
    expect(p.y).toBeGreaterThanOrEqual(e.y + e.height);
    expect(Math.abs(p.x - e.x)).toBeLessThan(1);
    expect(e.width).toBeGreaterThan(300);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);

    await editor.getByRole('button', { name: 'Publish' }).click();
    await publicSite.getByRole('button', { name: 'Post page' }).click();
    await expect(publicSite.getByRole('heading', { level: 1 })).toHaveText(
      'Hello from the demo',
    );
  });
});

const prefixOf = (slug: string) => slug.replace(/-project$/, '');
