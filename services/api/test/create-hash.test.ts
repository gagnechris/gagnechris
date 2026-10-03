import { describe, expect, it } from 'vitest';
import {
  createHashMatches,
  hashCreateFields,
  joinCreateFields,
} from '../src/data/create-hash.js';
import { noteCreatePayloadHash } from '../src/notes/repository.js';
import { taskCreatePayloadHash } from '../src/tasks/repository.js';

describe('create-payload hash', () => {
  const fields = ['user', 'work', 'page', '', 'Title', 'secret body', '', '0'];

  it('stores a sha256 digest, not the fields', () => {
    const hash = hashCreateFields(fields);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hash).not.toContain('secret');
  });

  it('matches the hashed form and the legacy plaintext form', () => {
    const request = hashCreateFields(fields);
    expect(createHashMatches(request, request)).toBe(true);
    expect(createHashMatches(joinCreateFields(fields), request)).toBe(true);
    expect(createHashMatches(undefined, request)).toBe(false);
    expect(createHashMatches(hashCreateFields([...fields, 'x']), request)).toBe(
      false,
    );
  });

  it('note and task hashes never include the text', () => {
    const note = noteCreatePayloadHash({
      userId: 'u',
      area: 'work',
      type: 'page',
      date: null,
      title: 'T',
      bodyMarkdown: 'hunter2',
      tags: ['a'],
      pinned: false,
    });
    const task = taskCreatePayloadHash({
      userId: 'u',
      area: 'work',
      title: 'T',
      description: 'hunter2',
      priority: 'med',
      status: 'todo',
      dueDate: null,
      noteId: null,
      tags: [],
    });
    for (const hash of [note, task]) {
      expect(hash).toMatch(/^sha256:/);
      expect(hash).not.toContain('hunter2');
    }
  });
});
