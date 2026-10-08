import { readFile } from 'node:fs/promises';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, requireEnv, test } from '../fixtures';

// The local site serves the publisher's HTML with the built app, as CloudFront does.
const site = () => requireEnv('E2E_SITE_URL');

type Manifest = Record<
  string,
  { file: string; isEntry?: boolean; imports?: string[] }
>;

const closure = (manifest: Manifest, key: string): Set<string> => {
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

/** JS only the markdown editor needs: CodeMirror and the editor itself. */
async function editorOnlyFiles(request: APIRequestContext) {
  const manifest = (await (
    await request.get(`${site()}/.vite/manifest.json`)
  ).json()) as Manifest;
  const editorKey = 'src/kit/markdown/MarkdownEditor.tsx';
  expect(manifest[editorKey], 'the editor is its own lazy chunk').toBeTruthy();
  const entryKey = Object.keys(manifest).find((k) => manifest[k]!.isEntry)!;
  const entry = closure(manifest, entryKey);
  return [...closure(manifest, editorKey)].filter((f) => !entry.has(f));
}

/** Console errors and uncaught exceptions on `page`. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** What the publisher's HTML says the page is called, before any script runs. */
async function servedHead(request: APIRequestContext, path: string) {
  const html = await (await request.get(`${site()}${path}`)).text();
  return {
    title: /<title>([\s\S]*?)<\/title>/.exec(html)?.[1],
    canonical: /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1],
  };
}

async function expectHead(
  page: Page,
  head: { title?: string; canonical?: string },
) {
  expect(head.title, 'served title').toBeTruthy();
  expect(head.canonical, 'served canonical').toBeTruthy();
  // The served HTML escapes entities; the DOM title is decoded.
  const title = await page.evaluate(
    (html) => new DOMParser().parseFromString(html, 'text/html').title,
    `<title>${head.title}</title>`,
  );
  await expect(page).toHaveTitle(title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    head.canonical!,
  );
}

test.describe('public site smoke', () => {
  let slug: string;
  let title: string;

  test.beforeEach(async ({ seed, prefix }) => {
    title = `Smoke ${prefix}`;
    slug = `${prefix}-smoke`;
    await seed.publishedPost({
      title,
      slug,
      bodyMarkdown: 'A post for the public smoke test.',
    });
  });

  test('every public page loads without errors or the editor’s JS', async ({
    page,
    request,
  }) => {
    const forbidden = await editorOnlyFiles(request);
    expect(forbidden.length).toBeGreaterThan(0);
    const errors = watchErrors(page);
    const scripts: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin === new URL(site()).origin) scripts.push(url.pathname);
    });

    for (const path of [
      '/',
      '/posts',
      `/posts/${slug}`,
      '/projects',
      '/resume',
      '/contact',
    ]) {
      await page.goto(`${site()}${path}`);
      await expect(page.locator('footer.site-footer')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const preloads = await page
        .locator('link[rel="modulepreload"]')
        .evaluateAll((links) =>
          links.map((l) => new URL((l as HTMLLinkElement).href).pathname),
        );
      expect(
        [...scripts, ...preloads].filter((f) => forbidden.includes(f)),
        `${path} loads the editor`,
      ).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('home → Posts → a post → Back stays in one document with the served title and canonical', async ({
    page,
    request,
  }) => {
    const heads = {
      home: await servedHead(request, '/'),
      posts: await servedHead(request, '/posts'),
      post: await servedHead(request, `/posts/${slug}`),
    };
    const errors = watchErrors(page);

    await page.goto(`${site()}/`);
    await expectHead(page, heads.home);
    await page.evaluate(() => {
      (window as unknown as { sameDocument: boolean }).sameDocument = true;
    });

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Posts' })
      .click();
    await expect(page).toHaveURL(`${site()}/posts`);
    await expectHead(page, heads.posts);

    await page.getByRole('link', { name: title }).click();
    await expect(page).toHaveURL(`${site()}/posts/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expectHead(page, heads.post);

    await page.goBack();
    await expect(page).toHaveURL(`${site()}/posts`);
    await expectHead(page, heads.posts);
    await page.goBack();
    await expect(page).toHaveURL(`${site()}/`);
    await expectHead(page, heads.home);

    expect(
      await page.evaluate(
        () => (window as unknown as { sameDocument?: boolean }).sameDocument,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test('/rss.xml is a feed with the published post', async ({
    page,
    request,
  }) => {
    const response = await request.get(`${site()}/rss.xml`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(
      /^application\/rss\+xml/,
    );
    const items = await page.evaluate(
      (xml) => {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) return null;
        return [...doc.querySelectorAll('rss > channel > item')].map(
          (item) => ({
            title: item.querySelector('title')?.textContent,
            link: item.querySelector('link')?.textContent,
          }),
        );
      },
      await response.text(),
    );
    expect(items, 'parses as XML').not.toBeNull();
    expect(items).toContainEqual({
      title,
      link: expect.stringMatching(new RegExp(`/posts/${slug}$`)),
    });
  });
});

test('the contact form sends the message', async ({ page, apps, prefix }) => {
  // The form ignores sends faster than a person could type; skip past that.
  await page.clock.install();
  await page.goto(`${apps.public}/contact`);
  const message = `Hello from ${prefix}`;
  await page.getByLabel('Name').fill('E2E Visitor');
  await page.getByLabel('Email').fill(`${prefix}@e2e.test`);
  await page.getByLabel('Message').fill(message);
  await page.clock.fastForward(5_000);

  const sent = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/contact',
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  expect((await sent).status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Thanks, your message is on its way.' }),
  ).toBeFocused();

  const outbox = requireEnv('E2E_OUTBOX_FILE');
  await expect
    .poll(async () => {
      const lines = (await readFile(outbox, 'utf8').catch(() => ''))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { text: string; replyTo: string[] });
      return lines.find((mail) => mail.text.includes(message));
    })
    .toMatchObject({ replyTo: [`${prefix}@e2e.test`] });
});
