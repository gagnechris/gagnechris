import { createApiClient } from '@gagnechris/api-client';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Project } from '../src/query/api.js';
import { setCachedProject } from '../src/query/cache.js';
import { queryKeys } from '../src/query/keys.js';
import {
  createStarterProjects,
  STARTER_PROJECTS,
} from '../src/query/projects.js';

const project = (over: Partial<Project> = {}): Project => ({
  id: '01PROJECT',
  slug: 'posts',
  name: 'Posts',
  pitch: '',
  stage: 'live',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: '',
  stack: [],
  links: [],
  demo: null,
  order: 1,
  href: null,
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-10-04T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
  ...over,
});

type Captured = { method: string; url: string; body: unknown };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Real openapi-fetch client; `takenOnServer` slugs answer 409 slug_taken. */
const fakeApi = (takenOnServer: string[] = []) => {
  const captured: Captured[] = [];
  vi.stubGlobal('fetch', async (input: Request) => {
    const text = await input.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    captured.push({ method: input.method, url: input.url, body });
    if (takenOnServer.includes(String(body.slug))) {
      return json(409, { error: 'slug_taken', message: 'taken' });
    }
    return json(201, project({ ...body, id: `01${String(body.slug)}` }));
  });
  return { client: createApiClient({ baseUrl: 'http://api.test' }), captured };
};

describe('createStarterProjects', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('creates the three starters as drafts with their stage, order and href', async () => {
    const { client, captured } = fakeApi();
    const result = await createStarterProjects(client, []);

    expect(result.skipped).toEqual([]);
    expect(result.created.map((p) => p.slug)).toEqual([
      'posts',
      'notebook',
      'dont-feed-the-bears',
    ]);
    expect(captured.map((c) => [c.method, c.url])).toEqual([
      ['POST', 'http://api.test/api/admin/projects'],
      ['POST', 'http://api.test/api/admin/projects'],
      ['POST', 'http://api.test/api/admin/projects'],
    ]);
    expect(captured.map((c) => c.body)).toEqual([
      expect.objectContaining({
        name: 'Posts',
        slug: 'posts',
        stage: 'live',
        order: 1,
      }),
      expect.objectContaining({
        name: 'Notebook',
        slug: 'notebook',
        stage: 'building',
        order: 2,
      }),
      expect.objectContaining({
        name: 'Don’t Feed the Bears',
        slug: 'dont-feed-the-bears',
        stage: 'live',
        order: 3,
        href: '/dont-feed-the-bears',
      }),
    ]);
    expect(STARTER_PROJECTS.every((s) => !('status' in s))).toBe(true);
  });

  test('skips slugs that already exist, so running it twice creates nothing new', async () => {
    const { client, captured } = fakeApi();
    const result = await createStarterProjects(client, [
      { slug: 'posts' },
      { slug: 'dont-feed-the-bears' },
    ]);
    expect(result.created.map((p) => p.slug)).toEqual(['notebook']);
    expect(result.skipped).toEqual(['posts', 'dont-feed-the-bears']);
    expect(captured).toHaveLength(1);

    const again = await createStarterProjects(client, [
      { slug: 'posts' },
      { slug: 'notebook' },
      { slug: 'dont-feed-the-bears' },
    ]);
    expect(again.created).toEqual([]);
    expect(captured).toHaveLength(1);
  });

  test('a slug held by a deleted project (409 slug_taken) is skipped, not an error', async () => {
    const { client } = fakeApi(['notebook']);
    const result = await createStarterProjects(client, []);
    expect(result.created.map((p) => p.slug)).toEqual([
      'posts',
      'dont-feed-the-bears',
    ]);
    expect(result.skipped).toEqual(['notebook']);
  });

  test('other failures still throw', async () => {
    vi.stubGlobal('fetch', async () => json(500, { error: 'internal' }));
    const client = createApiClient({ baseUrl: 'http://api.test' });
    await expect(createStarterProjects(client, [])).rejects.toThrow(
      /Could not create project \(500\)/,
    );
  });
});

describe('setCachedProject', () => {
  test('updates detail and the fetched list; deleted drops from the list', () => {
    const queryClient = new QueryClient();
    const a = project();
    const b = project({ id: '01OTHER', slug: 'notebook', order: 2 });
    queryClient.setQueryData(queryKeys.projects.list(), [a, b]);

    const renamed = { ...a, name: 'Renamed', version: 2 };
    setCachedProject(queryClient, renamed);
    expect(queryClient.getQueryData(queryKeys.projects.list())).toEqual([
      renamed,
      b,
    ]);
    expect(queryClient.getQueryData(queryKeys.projects.detail(a.id))).toEqual(
      renamed,
    );

    setCachedProject(queryClient, { ...a, name: 'Stale', version: 1 });
    expect(
      queryClient.getQueryData<Project[]>(queryKeys.projects.list())?.[0],
    ).toEqual(renamed);

    setCachedProject(queryClient, { ...b, status: 'deleted', version: 3 });
    expect(queryClient.getQueryData(queryKeys.projects.list())).toEqual([
      renamed,
    ]);
  });

  test('a new project joins a fetched list but never seeds an unfetched one', () => {
    const queryClient = new QueryClient();
    setCachedProject(queryClient, project());
    expect(queryClient.getQueryData(queryKeys.projects.list())).toBeUndefined();

    queryClient.setQueryData(queryKeys.projects.list(), []);
    setCachedProject(queryClient, project());
    expect(queryClient.getQueryData(queryKeys.projects.list())).toEqual([
      project(),
    ]);
  });
});
