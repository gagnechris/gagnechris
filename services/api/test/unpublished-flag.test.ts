import { beforeEach, describe, expect, it, type Mock } from 'vitest';
import {
  POST_SUMMARY_ATTRIBUTES,
  keys,
  postMetaSk,
  postPk,
  postPublishedSk,
} from '@gagnechris/data';
import { PostsRepository } from '../src/posts/repository.js';
import { ProjectsRepository } from '../src/projects/repository.js';
import { createMemoryDoc } from './support/memory-doc.js';

const TABLE = 'gagnechris-test';

type Memory = ReturnType<typeof createMemoryDoc>;

const sendMock = (memory: Memory) => memory.doc.send as unknown as Mock;

function commandsNamed(memory: Memory, name: string) {
  return sendMock(memory)
    .mock.calls.map(
      (c) =>
        c[0] as {
          constructor: { name: string };
          input: Record<string, unknown>;
        },
    )
    .filter((c) => c.constructor.name === name);
}

function stripStoredFlag(memory: Memory, key: { pk: string; sk: string }) {
  const k = `${key.pk}\0${key.sk}`;
  const { hasUnpublishedChanges: _flag, ...rest } = memory.store.get(k)!;
  memory.store.set(k, rest);
}

describe('stored hasUnpublishedChanges: posts', () => {
  let memory: Memory;
  let repo: PostsRepository;

  beforeEach(() => {
    memory = createMemoryDoc();
    repo = new PostsRepository(memory.doc, TABLE);
  });

  const metaKey = (id: string) => ({ pk: postPk(id), sk: postMetaSk() });
  const storedFlag = (id: string) =>
    memory.store.get(`${postPk(id)}\0${postMetaSk()}`)?.hasUnpublishedChanges;

  async function livePost(title = 'Hello') {
    const created = await repo.create({
      title,
      excerpt: '',
      bodyMarkdown: 'live',
      tags: [],
      projectIds: [],
    });
    return repo.publish(created.id, created.version);
  }

  it('create writes false on the META row', async () => {
    const created = await repo.create({
      title: 'Hello',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
      projectIds: [],
    });
    expect(storedFlag(created.id)).toBe(false);
  });

  it('a draft save on a live post writes true; on a draft writes false', async () => {
    const live = await livePost();
    const edited = await repo.update(live.id, {
      version: live.version,
      bodyMarkdown: 'edited',
    });
    expect(storedFlag(live.id)).toBe(true);
    expect(edited.hasUnpublishedChanges).toBe(true);

    const draft = await repo.create({
      title: 'Draft',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
      projectIds: [],
    });
    await repo.update(draft.id, { version: draft.version, title: 'Renamed' });
    expect(storedFlag(draft.id)).toBe(false);
  });

  it('a save that restores the live content writes false', async () => {
    const live = await livePost();
    const edited = await repo.update(live.id, {
      version: live.version,
      bodyMarkdown: 'edited',
    });
    await repo.update(live.id, {
      version: edited.version,
      bodyMarkdown: 'live',
    });
    expect(storedFlag(live.id)).toBe(false);
  });

  it('publish, discard and unpublish write false', async () => {
    const live = await livePost();
    expect(storedFlag(live.id)).toBe(false);

    const edited = await repo.update(live.id, {
      version: live.version,
      bodyMarkdown: 'edited',
    });
    const discarded = await repo.discard(live.id, edited.version);
    expect(storedFlag(live.id)).toBe(false);

    const edited2 = await repo.update(live.id, {
      version: discarded.version,
      bodyMarkdown: 'edited again',
    });
    const republished = await repo.publish(live.id, edited2.version);
    expect(storedFlag(live.id)).toBe(false);

    await repo.update(live.id, {
      version: republished.version,
      bodyMarkdown: 'pending',
    });
    expect(storedFlag(live.id)).toBe(true);
    const current = await repo.getByIdOrThrow(live.id);
    await repo.unpublish(live.id, current.version);
    expect(storedFlag(live.id)).toBe(false);
  });

  it('the PUBLISHED row never carries the flag', async () => {
    const live = await livePost();
    await repo.update(live.id, { version: live.version, bodyMarkdown: 'x' });
    const published = memory.store.get(
      `${postPk(live.id)}\0${postPublishedSk()}`,
    );
    expect(published).toBeDefined();
    expect(published).not.toHaveProperty('hasUnpublishedChanges');
  });

  it('list reads summary attributes only and does no BatchGet', async () => {
    const live = await livePost();
    await repo.update(live.id, {
      version: live.version,
      bodyMarkdown: 'edited',
    });
    await repo.create({
      title: 'Draft',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
      projectIds: [],
    });
    sendMock(memory).mockClear();

    const page = await repo.list(undefined);

    expect(commandsNamed(memory, 'BatchGetCommand')).toHaveLength(0);
    const queries = commandsNamed(memory, 'QueryCommand');
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      const names = q.input.ExpressionAttributeNames as Record<string, string>;
      const projected = (q.input.ProjectionExpression as string)
        .split(',')
        .map((t) => names[t.trim()]);
      expect(projected.sort()).toEqual([...POST_SUMMARY_ATTRIBUTES].sort());
      expect(projected).not.toContain('bodyMarkdown');
    }
    expect(
      page.items.map((p) => [p.title, p.status, p.hasUnpublishedChanges]),
    ).toEqual([
      ['Hello', 'published', true],
      ['Draft', 'draft', false],
    ]);
    expect(page.items[0]).not.toHaveProperty('bodyMarkdown');
  });

  it('a META row without the stored flag falls back to comparing with PUBLISHED', async () => {
    const dirty = await livePost();
    await repo.update(dirty.id, {
      version: dirty.version,
      bodyMarkdown: 'edited',
    });
    const clean = await livePost('Clean');
    stripStoredFlag(memory, metaKey(dirty.id));
    stripStoredFlag(memory, metaKey(clean.id));
    sendMock(memory).mockClear();

    const page = await repo.list('published');

    expect(commandsNamed(memory, 'BatchGetCommand')).toHaveLength(1);
    const flags = Object.fromEntries(
      page.items.map((p) => [p.id, p.hasUnpublishedChanges]),
    );
    expect(flags).toEqual({ [dirty.id]: true, [clean.id]: false });
  });
});

describe('stored hasUnpublishedChanges: projects', () => {
  let memory: Memory;
  let repo: ProjectsRepository;

  beforeEach(() => {
    memory = createMemoryDoc();
    repo = new ProjectsRepository(memory.doc, TABLE);
  });

  const storedFlag = (id: string) => {
    const key = keys.project.meta(id);
    return memory.store.get(`${key.pk}\0${key.sk}`)?.hasUnpublishedChanges;
  };

  async function liveProject(name = 'Notebook') {
    const created = await repo.create({
      name,
      pitch: 'live',
      stage: 'idea',
      stageNote: '',
      bodyMarkdown: '',
      stack: [],
      links: [],
      order: 1,
    });
    return repo.publish(created.id, created.version);
  }

  it('each write path stores the flag', async () => {
    const live = await liveProject();
    expect(storedFlag(live.id)).toBe(false);
    const edited = await repo.update(live.id, {
      version: live.version,
      pitch: 'edited',
    });
    expect(storedFlag(live.id)).toBe(true);
    const discarded = await repo.discard(live.id, edited.version);
    expect(storedFlag(live.id)).toBe(false);
    const edited2 = await repo.update(live.id, {
      version: discarded.version,
      pitch: 'edited',
    });
    expect(storedFlag(live.id)).toBe(true);
    const republished = await repo.publish(live.id, edited2.version);
    expect(storedFlag(live.id)).toBe(false);
    const edited3 = await repo.update(live.id, {
      version: republished.version,
      pitch: 'pending',
    });
    await repo.unpublish(live.id, edited3.version);
    expect(storedFlag(live.id)).toBe(false);
  });

  it('list uses the stored flag with no BatchGet, and falls back without it', async () => {
    const dirty = await liveProject('Dirty');
    await repo.update(dirty.id, { version: dirty.version, pitch: 'edited' });
    const legacy = await liveProject('Legacy');
    const legacyEdited = await repo.update(legacy.id, {
      version: legacy.version,
      pitch: 'edited',
    });
    expect(legacyEdited.hasUnpublishedChanges).toBe(true);
    sendMock(memory).mockClear();

    const stored = await repo.list();
    expect(commandsNamed(memory, 'BatchGetCommand')).toHaveLength(0);
    expect(stored.items.map((p) => p.hasUnpublishedChanges)).toEqual([
      true,
      true,
    ]);

    stripStoredFlag(memory, keys.project.meta(legacy.id));
    sendMock(memory).mockClear();
    const fallback = await repo.list();
    expect(commandsNamed(memory, 'BatchGetCommand')).toHaveLength(1);
    expect(
      Object.fromEntries(
        fallback.items.map((p) => [p.name, p.hasUnpublishedChanges]),
      ),
    ).toEqual({ Dirty: true, Legacy: true });
  });
});
