import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { expect, requireEnv, test } from '../fixtures';
import { REPO_ROOT } from '../stack';

// The `api` project runs this alone, before the browser projects.
test.describe.configure({ mode: 'serial' });

const site = () => requireEnv('E2E_SITE_URL');
const siteRoot = () => requireEnv('E2E_SITE_ROOT');

// The 404 page, the app script and the asset scan need the real site, not the
// minimal shell the stack falls back to.
test.skip(
  () => !existsSync(join(siteRoot(), 'assets')),
  'needs an apps/web build (npm run build)',
);

const html = async (request: APIRequestContext, path: string) => {
  const res = await request.get(`${site()}${path}`);
  expect(res.status(), `${path} status`).toBe(200);
  return res.text();
};

/** The styled 404 the way CloudFront serves it: status 404, HTML, the page. */
const expectHtml404 = async (request: APIRequestContext, path: string) => {
  const res = await request.get(`${site()}${path}`);
  expect(res.status(), `${path} status`).toBe(404);
  expect(res.headers()['content-type'], `${path} content-type`).toMatch(
    /^text\/html/,
  );
  expect(await res.text(), `${path} body`).toContain('Page not found');
};

test('a post: publish, edit without going live, publish changes, unpublish', async ({
  request,
  seed,
  prefix,
}) => {
  // An orphan page the rebuild after any publish must remove.
  const orphan = join(siteRoot(), 'blog', `${prefix}-orphan`, 'index.html');
  await mkdir(join(orphan, '..'), { recursive: true });
  await writeFile(orphan, '<html>orphan</html>');

  const slug = `${prefix}-post`;
  const post = await seed.publishedPost({
    title: 'Local E2E Post',
    slug,
    excerpt: 'Local excerpt',
    bodyMarkdown: '## Hello\n\nLocal body.',
  });

  const page = await html(request, `/posts/${slug}`);
  expect(page).toContain('Local E2E Post');
  expect(page).toContain('property="og:title"');
  expect(page).toContain('class="blog-post-prerender"');
  expect(page).toContain('Local body');
  expect(await html(request, '/')).toContain(
    `href="/posts/${slug}">Local E2E Post</a>`,
  );

  const legacy = await request.get(`${site()}/blog/${slug}`, {
    maxRedirects: 0,
  });
  expect(legacy.status()).toBe(301);
  expect(new URL(legacy.headers().location!, site()).href).toBe(
    `${site()}/posts/${slug}`,
  );

  const { data: draftHome } = await seed.api.GET('/api/admin/home');
  expect(draftHome?.status).toBe('draft');
  const { data: home } = await seed.api.POST('/api/admin/home/publish', {
    body: { version: draftHome!.version },
  });
  expect(home).toMatchObject({
    status: 'published',
    hasUnpublishedChanges: false,
  });
  const homePage = await html(request, '/');
  expect(homePage).toContain('home-page-prerender');
  expect(homePage).toContain('class="home-hero__links"');
  expect(homePage).toContain(`href="/posts/${slug}">Local E2E Post</a>`);
  expect(homePage).toContain('<script type="module"');
  const postPage = await html(request, `/posts/${slug}`);
  expect(postPage, 'Home prerender leaked into the post').not.toContain(
    'home-page-prerender',
  );
  expect(postPage).toContain('class="blog-post-prerender"');

  const { data: edited } = await seed.api.PUT('/api/admin/posts/{id}', {
    params: { path: { id: post.id } },
    body: { version: post.version, title: 'Local E2E Updated' },
  });
  expect(edited).toMatchObject({
    title: 'Local E2E Updated',
    hasUnpublishedChanges: true,
  });
  const live = await html(request, `/posts/${slug}`);
  expect(live).toContain('Local E2E Post');
  expect(live, 'a draft edit went live before publish').not.toContain(
    'Local E2E Updated',
  );

  const { data: republished } = await seed.api.POST(
    '/api/admin/posts/{id}/publish',
    { params: { path: { id: post.id } }, body: { version: edited!.version } },
  );
  expect(republished).toMatchObject({
    title: 'Local E2E Updated',
    hasUnpublishedChanges: false,
  });
  expect(await html(request, `/posts/${slug}`)).toContain('Local E2E Updated');
  expect(await html(request, '/')).toContain(
    `href="/posts/${slug}">Local E2E Updated</a>`,
  );

  // The viewer-request function 404s slugs missing from the KVS without
  // reading the bucket, so a 404 alone doesn't show the file was deleted.
  expect(existsSync(orphan), 'the publisher left the orphan page').toBe(false);
  await expectHtml404(request, `/posts/${prefix}-orphan`);

  await seed.api.POST('/api/admin/posts/{id}/unpublish', {
    params: { path: { id: post.id } },
    body: { version: republished!.version },
  });
  expect(existsSync(join(siteRoot(), 'blog', slug, 'index.html'))).toBe(false);
  await expectHtml404(request, `/posts/${slug}`);
  expect(await html(request, '/')).not.toContain(`/posts/${slug}`);
});

test('a project and an idea: listing, Build log, slug rename, unpublish', async ({
  request,
  seed,
  prefix,
}) => {
  const slug = `${prefix}-project`;
  const name = `Local E2E Project ${prefix}`;
  const ideaName = `Local E2E Idea ${prefix}`;
  const project = await seed.publishedProject({
    name,
    slug,
    stage: 'building',
    pitch: 'Local pitch',
    bodyMarkdown: '## Why I built it\n\nLocal project body.',
  });
  await seed.publishedProject({
    name: ideaName,
    slug: `${slug}-idea`,
    stage: 'idea',
  });

  const page = await html(request, `/projects/${slug}`);
  expect(page).toContain(`<h1>${name}</h1>`);
  expect(page).toContain('Local project body');
  expect(page).toContain('class="site-header"');
  const index = await html(request, '/projects');
  expect(index).toContain(
    `<a class="project-card__link" href="/projects/${slug}">`,
  );
  expect(index).toContain(`<h2 class="project-card__name">${name}</h2>`);
  expect(index).toContain(`<h2 class="project-card__name">${ideaName}</h2>`);
  const home = await html(request, '/');
  expect(home).toContain(`<h3 class="project-card__name">${name}</h3>`);
  expect(home, 'an idea is listed on Home').not.toContain(ideaName);
  await expectHtml404(request, `/projects/${slug}-idea`);
  const sitemap = await html(request, '/sitemap.xml');
  expect(sitemap).toContain(`/projects/${slug}</loc>`);
  expect(sitemap, 'an idea with no body is in the sitemap').not.toContain(
    `/projects/${slug}-idea<`,
  );

  const unknown = await seed.api.POST('/api/admin/posts', {
    body: { title: 'Untagged', projectIds: ['01NOSUCHPROJECT0000000000'] },
  });
  expect(unknown.response.status).toBe(400);

  const logSlug = `${prefix}-log`;
  await seed.publishedPost({
    title: 'Local E2E Build Log',
    slug: logSlug,
    bodyMarkdown: 'Tagged.',
    projectIds: [project.id],
  });
  const buildLogEntry = `<a class="project-build-log__link" href="/posts/${logSlug}"><h3 class="project-build-log__title">Local E2E Build Log</h3>`;
  expect(await html(request, `/projects/${slug}`)).toContain(buildLogEntry);
  expect(await html(request, `/posts/${logSlug}`)).toContain(
    `<p class="post-part-of">Part of the <a class="post-part-of__project" href="/projects/${slug}">${name}</a> project</p>`,
  );

  const renamed = `${slug}-renamed`;
  const { data: edited } = await seed.api.PUT('/api/admin/projects/{id}', {
    params: { path: { id: project.id } },
    body: { version: project.version, slug: renamed },
  });
  const { data: republished } = await seed.api.POST(
    '/api/admin/projects/{id}/publish',
    {
      params: { path: { id: project.id } },
      body: { version: edited!.version },
    },
  );
  expect(republished?.slug).toBe(renamed);
  expect(await html(request, `/projects/${renamed}`)).toContain(buildLogEntry);
  expect(await html(request, `/posts/${logSlug}`)).toContain(
    `href="/projects/${renamed}">${name}</a>`,
  );

  await seed.api.POST('/api/admin/projects/{id}/unpublish', {
    params: { path: { id: project.id } },
    body: { version: republished!.version },
  });
  await expectHtml404(request, `/projects/${renamed}`);
  await expectHtml404(request, `/projects/${slug}`);
  expect(await html(request, '/projects')).not.toContain(name);
  expect(await html(request, '/')).not.toContain(name);
  expect(await html(request, '/sitemap.xml')).not.toContain(
    `/projects/${renamed}<`,
  );
  expect(
    await html(request, `/posts/${logSlug}`),
    'the post still shows Part of an unpublished project',
  ).not.toContain('post-part-of');
});

test('unknown page URLs are the HTML 404; real pages are 200', async ({
  request,
}) => {
  for (const path of [
    '/projects/does-not-exist',
    '/projects/x',
    '/resume/x',
    '/contact/x',
    '/dont-feed-the-bears/x',
    '/dont-feed-the-bears/camp/x',
    '/x.html',
    '/resume/x.html',
    '/posts/x',
    '/nope',
  ]) {
    await expectHtml404(request, path);
  }
  for (const path of [
    '/',
    '/posts',
    '/posts/',
    '/resume',
    '/resume/',
    '/contact',
    '/contact/',
    '/dont-feed-the-bears',
    '/dont-feed-the-bears/',
    '/dont-feed-the-bears/camp/',
    '/dont-feed-the-bears/wild/',
    '/projects',
    '/projects/',
    '/sitemap.xml',
    '/rss.xml',
    '/posts/posts.json',
  ]) {
    await html(request, path);
  }
});

test('the built app never fetches /__site, which only the Vite dev server proxies', async () => {
  const assets = join(siteRoot(), 'assets');
  for (const name of await readdir(assets)) {
    if (!name.endsWith('.js')) continue;
    expect(
      await readFile(join(assets, name), 'utf8'),
      `assets/${name}`,
    ).not.toContain('/__site');
  }
});

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });

test('the local site, like CloudFront, skips viewer-response on an origin 4xx', async ({
  request,
}) => {
  // A second static server whose viewer-response function marks responses.
  const probeRoot = await mkdtemp(join(tmpdir(), 'viewer-response-'));
  const functions = join(probeRoot, 'infra', 'lib', 'cloudfront');
  await mkdir(functions, { recursive: true });
  await copyFile(
    join(REPO_ROOT, 'infra/lib/cloudfront/viewer-request-function.js'),
    join(functions, 'viewer-request-function.js'),
  );
  await writeFile(
    join(functions, 'viewer-response-function.js'),
    `function handler(event) {
  event.response.headers['x-viewer-response'] = { value: 'ran' };
  return event.response;
}
`,
  );
  const port = await freePort();
  const probe = spawn(
    join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
    ['services/api/local/static-server.ts'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        REPO_ROOT: probeRoot,
        SITE_BUCKET_NAME: siteRoot(),
        LOCAL_SITE_PORT: String(port),
      },
      stdio: 'ignore',
    },
  );
  try {
    const origin = `http://127.0.0.1:${port}`;
    await expect
      .poll(() =>
        request
          .get(`${origin}/`)
          .then((res) => res.status())
          .catch(() => 0),
      )
      .toBe(200);
    expect(
      (await request.get(`${origin}/`)).headers()['x-viewer-response'],
    ).toBe('ran');
    const missing = await request.get(`${origin}/assets/no-such-file-e2e.js`);
    expect(missing.status()).toBe(404);
    expect(
      missing.headers()['x-viewer-response'],
      'viewer-response ran on an origin 404',
    ).toBeUndefined();
  } finally {
    probe.kill();
    await rm(probeRoot, { recursive: true, force: true });
  }
});
