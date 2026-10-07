import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect, requireEnv, test, type Seed } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

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
    const { id } = await seed.publishedProject({
      name,
      slug,
      stage: 'live',
      pitch: 'A pitch.',
      bodyMarkdown: BODY,
      stack: ['React', 'DynamoDB'],
    });
    for (const [title, postSlug] of [
      [`First ${prefix}`, first],
      [`Second ${prefix}`, second],
    ]) {
      await seed.publishedPost({
        title,
        slug: postSlug,
        bodyMarkdown: 'Tagged.',
        projectIds: [id],
      });
    }
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
    await seed.publishedProject({
      name: `Demo ${prefix}`,
      slug: `${prefix}-demo`,
      stage: 'building',
      bodyMarkdown: BODY,
      demo: 'notebook',
      previewImage: `/media/projects/${prefix}.png`,
    });
    await seed.publishedProject({
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
    await seed.publishedProject({
      name: `Fixture ${prefix}`,
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
    await expect(
      slot.getByRole('button', { name: 'Add', exact: true }),
    ).toBeFocused();
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
    expect(requests.filter((u) => u.origin !== pageOrigin).map(String)).toEqual(
      [],
    );
    expect(
      requests
        .slice(fromInteraction)
        .filter((u) => u.origin === pageOrigin)
        .map(String),
    ).toEqual([]);
  });
});

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

const CODEMIRROR = 'src/kit/markdown/MarkdownEditor.tsx';

test.describe('the Posts demo on the built site', () => {
  const DEMO = 'src/demos/posts/index.tsx';

  const publishPostsDemo = async (
    seed: Seed,
    prefix: string,
    request: APIRequestContext,
  ) => {
    const slug = `${prefix}-posts-demo`;
    await seed.publishedProject({
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

    const note = await expectPostsDemoNote(slot, SIDE_BY_SIDE_NOTE);
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
    await expect(article.getByRole('heading', { level: 3 })).toHaveText(
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
    await expect(article.getByRole('heading', { level: 3 })).toHaveText(
      'Hello from the demo',
    );
    await editor.getByRole('button', { name: 'Publish changes' }).click();
    await expect(article.getByRole('heading', { level: 3 })).toHaveText(
      'Hello again',
    );
    await expect(editor.getByText('Unpublished changes')).toHaveCount(0);

    await slot.getByRole('button', { name: 'Reset' }).click();
    await expect(caption).toHaveText(/^Draft/);
    await expect(title).toHaveValue('Hello from the demo');
    await page.waitForLoadState('networkidle');

    const pageOrigin = new URL(site()).origin;
    expect(requests.filter((u) => u.pathname.startsWith('/api/'))).toEqual([]);
    expect(requests.filter((u) => u.origin !== pageOrigin).map(String)).toEqual(
      [],
    );
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

  test('on a phone the panes stack, editor first, the note says above and below, with no sideways scroll', async ({
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
    await expectPostsDemoNote(slot, STACKED_NOTE);

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
    await expect(publicSite.getByRole('heading', { level: 3 })).toHaveText(
      'Hello from the demo',
    );
  });
});

test.describe('the Notebook demo on the built site', () => {
  const DEMO = 'src/demos/notebook/index.tsx';
  const SCHEDULED =
    'Scheduled for Mon. It stays in this note, and from that day it shows under Still open on Today.';

  const publishNotebookDemo = async (
    seed: Seed,
    prefix: string,
    request: APIRequestContext,
  ) => {
    const slug = `${prefix}-notebook-demo`;
    await seed.publishedProject({
      name: `Notebook ${prefix}`,
      slug,
      stage: 'building',
      bodyMarkdown: BODY,
      demo: 'notebook',
      previewImage: `/media/projects/${prefix}.png`,
    });
    await expect
      .poll(async () =>
        (await request.get(`${site()}/projects/${slug}`)).status(),
      )
      .toBe(200);
    return slug;
  };

  test('loads lazily without CodeMirror and works from the keyboard: type, Enter, Tab to checkboxes and + Note, Space toggles; no /api requests', async ({
    page,
    seed,
    prefix,
    request,
    browserName,
  }) => {
    // Safari moves focus only between text fields on plain Tab.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const manifest = (await (
      await request.get(`${site()}/.vite/manifest.json`)
    ).json()) as Manifest;
    expect(manifest[DEMO], 'Notebook demo chunk').toBeDefined();
    expect(manifest[DEMO]!.dynamicImports ?? []).toEqual([]);
    const demoFile = `/${manifest[DEMO]!.file}`;
    const editorFile = `/${manifest[CODEMIRROR]!.file}`;
    expect(staticFiles(manifest, DEMO).has(editorFile)).toBe(false);
    expect(staticFiles(manifest, 'index.html').has(demoFile)).toBe(false);

    const slug = await publishNotebookDemo(seed, prefix, request);
    // Friday, October 2, 2026 on the visitor's clock.
    await page.clock.setFixedTime(new Date(2026, 9, 2, 9, 0));
    const requests: URL[] = [];
    page.on('request', (req) => requests.push(new URL(req.url())));
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

    await slot.scrollIntoViewIfNeeded();
    await page.setViewportSize({ width: 1280, height: 1000 });
    const input = slot.getByRole('combobox', { name: 'New task' });
    await expect(input).toBeVisible();
    expect(fetched(demoFile)).toBe(true);
    await expect(
      slot.getByRole('heading', { name: 'Friday, October 2' }),
    ).toBeVisible();
    const note = slot.locator('.demo-frame__note--label');
    await expect(note).toHaveText(
      'Sample data, runs in your browser, nothing is saved',
      { useInnerText: true },
    );
    const label = slot.getByRole('heading', { name: 'Try it' });
    expect(
      Math.abs((await note.boundingBox())!.y - (await label.boundingBox())!.y),
    ).toBeLessThan(4);

    const todayNote = slot.getByRole('region', { name: 'Today’s note' });
    const stillOpen = slot.getByTestId('still-open');
    const comingUp = slot.getByTestId('coming-up');
    const side = (await stillOpen.boundingBox())!;
    const main = (await todayNote.boundingBox())!;
    expect(side.x).toBeGreaterThan(main.x + main.width);
    await expect(stillOpen.getByText('Thu note · 1 day')).toBeVisible();
    await expect(comingUp.locator('li')).toHaveText(['Write weekly notesSat']);

    const fromInteraction = requests.length;
    const reset = slot.getByRole('button', { name: 'Reset demo' });
    await reset.focus();
    await page.keyboard.press(tab);
    await expect(
      todayNote.getByRole('checkbox', {
        name: 'Reopen Review publisher retry PR',
      }),
    ).toBeFocused();
    await page.keyboard.press(tab);
    const sidebar = todayNote.getByRole('checkbox', {
      name: 'Complete Draft sidebar nav spec',
    });
    await expect(sidebar).toBeFocused();
    await page.keyboard.press('Space');
    await expect(
      todayNote.getByRole('checkbox', {
        name: 'Reopen Draft sidebar nav spec',
      }),
    ).toBeChecked();

    await page.keyboard.press(tab);
    await expect(input).toBeFocused();
    await page.keyboard.type('Call Sam @mon !high');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    const sam = todayNote.locator('.task-embed', { hasText: 'Call Sam' });
    await expect(sam).toContainText('@Mon');
    await expect(sam.locator('.task-embed__pill--high')).toHaveText('High');
    // In today's note, so not under Coming up, as on the app's Today.
    await expect(comingUp.locator('li')).toHaveText(['Write weekly notesSat']);
    await expect(slot.locator('.notebook-demo__hint')).toHaveText(SCHEDULED);

    await page.keyboard.press(tab);
    await expect(
      slot.getByRole('button', { name: 'Add', exact: true }),
    ).toBeFocused();
    await page.keyboard.press(tab);
    await page.keyboard.press(tab);
    const plusNote = stillOpen.getByRole('button', {
      name: 'Add Reply to recruiter email to the note',
    });
    await expect(plusNote).toBeFocused();
    await expect(plusNote).toHaveText('+ Note');
    await page.keyboard.press('Space');
    const recruiter = todayNote.getByRole('checkbox', {
      name: 'Complete Reply to recruiter email',
    });
    await expect(recruiter).toBeFocused();
    await expect(stillOpen.getByText('Reply to recruiter email')).toHaveCount(
      0,
    );
    await page.keyboard.press('Space');
    await expect(
      todayNote.getByRole('checkbox', {
        name: 'Reopen Reply to recruiter email',
      }),
    ).toBeChecked();

    await reset.click();
    await expect(slot.getByText('Call Sam')).toHaveCount(0);
    await expect(stillOpen.locator('li')).toHaveCount(2);
    await expect(sidebar).not.toBeChecked();
    await page.waitForLoadState('networkidle');

    const pageOrigin = new URL(site()).origin;
    expect(fetched(editorFile)).toBe(false);
    expect(requests.filter((u) => u.pathname.startsWith('/api/'))).toEqual([]);
    expect(requests.filter((u) => u.origin !== pageOrigin).map(String)).toEqual(
      [],
    );
    expect(
      requests
        .slice(fromInteraction)
        .filter(
          (u) => u.origin === pageOrigin && !u.pathname.endsWith('.woff2'),
        )
        .map(String),
    ).toEqual([]);
  });

  test('on a phone the side panels are tabs under the note, the day is the visitor’s, with no sideways scroll', async ({
    browser,
    seed,
    prefix,
    request,
  }) => {
    const slug = await publishNotebookDemo(seed, prefix, request);
    // Noon UTC on Friday is already Saturday on Kiritimati (UTC+14).
    const context = await browser.newContext({
      timezoneId: 'Pacific/Kiritimati',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-02T12:00:00Z'));
    await page.goto(`${site()}/projects/${slug}`);
    const slot = page.getByRole('region', { name: 'Try it' });
    await slot.scrollIntoViewIfNeeded();
    const input = slot.getByRole('combobox', { name: 'New task' });
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute(
      'placeholder',
      'Try: Call Sam @mon !high',
    );
    await expect(
      slot.getByRole('heading', { name: 'Saturday, October 3' }),
    ).toBeVisible();
    await expect(slot.getByRole('button', { name: 'Reset' })).toBeVisible();

    const note = slot.locator('.demo-frame__note--label');
    await expect(note).toHaveText('· nothing is saved', {
      useInnerText: true,
    });
    const label = slot.getByRole('heading', { name: 'Try it' });
    const n = (await note.boundingBox())!;
    const l = (await label.boundingBox())!;
    expect(Math.abs(n.y - l.y)).toBeLessThan(4);
    expect(n.x).toBeGreaterThan(l.x);

    await input.fill('Call Sam @mon');
    await input.press('Enter');
    const tabs = slot.getByRole('tab');
    await expect(tabs).toHaveText(['Still open · 2', 'Coming up · 1']);
    const todayNote = slot.getByRole('region', { name: 'Today’s note' });
    const t = (await tabs.first().boundingBox())!;
    const m = (await todayNote.boundingBox())!;
    expect(t.y).toBeGreaterThanOrEqual(m.y + m.height - 1);
    await expect(slot.getByRole('tabpanel')).toContainText(
      'Reply to recruiter email',
    );
    await tabs.nth(1).click();
    await expect(slot.getByRole('tabpanel')).toContainText(
      'Write weekly notes',
    );
    await expect(slot.getByRole('tabpanel')).not.toContainText('Call Sam');

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await context.close();
  });
});

const SIDE_BY_SIDE_NOTE =
  'Write on the left, publish, watch the right. Nothing is saved.';
const STACKED_NOTE = 'Write above, publish, watch below. Nothing is saved.';

/** Exactly one wording is shown and exposed to assistive tech. */
const expectPostsDemoNote = async (slot: Locator, wording: string) => {
  const note = slot.locator('.demo-frame__note--label');
  await expect(note.getByText(wording, { exact: true })).toBeVisible();
  const other = wording === STACKED_NOTE ? SIDE_BY_SIDE_NOTE : STACKED_NOTE;
  await expect(note.getByText(other, { exact: true })).toBeHidden();
  expect(await note.evaluate((el) => (el as HTMLElement).innerText)).toBe(
    wording,
  );
  expect(await note.ariaSnapshot()).toBe(`- paragraph: ${wording}`);
  return note;
};

const prefixOf = (slug: string) => slug.replace(/-project$/, '');
