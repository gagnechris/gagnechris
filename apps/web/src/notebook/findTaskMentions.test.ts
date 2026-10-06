import { describe, expect, it } from 'vitest';
import type { ListNote } from './noteListSections';
import { embedContext, taskMentions } from './findTaskMentions';

const A = '01JAAAAAAAAAAAAAAAAAAAAAAA';
const B = '01JBBBBBBBBBBBBBBBBBBBBBBB';

function note(over: Partial<ListNote> & Pick<ListNote, 'id'>): ListNote {
  return {
    type: 'daily',
    date: '2026-10-01',
    title: '',
    bodyMarkdown: '',
    pinned: false,
    updatedAt: '2026-10-01T10:00:00.000Z',
    area: 'work',
    ...over,
  };
}

describe('embedContext', () => {
  it('reads the prose under the embed, markers stripped', () => {
    const md = [
      '# Monday',
      `{{task:${A}}}`,
      'Called the **vendor**.',
      '- waiting on a quote',
      '',
      'Then nothing.',
    ].join('\n');
    expect(embedContext(md, A)).toBe(
      'Called the vendor. waiting on a quote Then nothing.',
    );
  });

  it('stops at the next embed', () => {
    const md = [
      `{{task:${A}}}`,
      'Context for A.',
      `{{task:${B}}}`,
      'Context for B.',
    ].join('\n');
    expect(embedContext(md, A)).toBe('Context for A.');
    expect(embedContext(md, B)).toBe('Context for B.');
  });

  it('is empty when the embed is last or absent', () => {
    expect(embedContext(`text\n{{task:${A}}}`, A)).toBe('');
    expect(embedContext('text', A)).toBe('');
  });

  it('truncates a long excerpt', () => {
    const context = embedContext(`{{task:${A}}}\n${'word '.repeat(100)}`, A);
    expect(context.endsWith('…')).toBe(true);
    expect(context.length).toBeLessThanOrEqual(281);
  });
});

describe('taskMentions', () => {
  it('lists the home note first, then the rest oldest to newest', () => {
    const notes = [
      note({ id: 'n3', date: '2026-10-03', bodyMarkdown: `{{task:${A}}}\nc3` }),
      note({ id: 'home', date: '2026-10-02', bodyMarkdown: `{{task:${A}}}` }),
      note({ id: 'n1', date: '2026-10-01', bodyMarkdown: `{{task:${A}}}\nc1` }),
      note({ id: 'other', bodyMarkdown: `{{task:${B}}}` }),
    ];
    const mentions = taskMentions(notes, A, 'home');
    expect(mentions.map((m) => m.note.id)).toEqual(['home', 'n1', 'n3']);
    expect(mentions.map((m) => m.context)).toEqual(['', 'c1', 'c3']);
    expect(mentions.map((m) => m.home)).toEqual([true, false, false]);
  });

  it('orders pages by their last edit and ignores notes without the embed', () => {
    const notes = [
      note({
        id: 'later',
        type: 'page',
        date: null,
        title: 'Later page',
        updatedAt: '2026-10-04T10:00:00.000Z',
        bodyMarkdown: `{{task:${A}}}`,
      }),
      note({
        id: 'earlier',
        type: 'page',
        date: null,
        title: 'Earlier page',
        updatedAt: '2026-10-02T10:00:00.000Z',
        bodyMarkdown: `{{task:${A}}}`,
      }),
      note({ id: 'none', bodyMarkdown: 'no embeds here' }),
    ];
    expect(taskMentions(notes, A, null).map((m) => m.note.id)).toEqual([
      'earlier',
      'later',
    ]);
  });
});
