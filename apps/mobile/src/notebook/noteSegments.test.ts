import { describe, expect, it } from 'vitest';
import {
  convertTaskLine,
  convertTaskLines,
  endedLines,
  joinSegments,
  noteSegments,
  rebaseText,
  removeSegment,
  replaceSegmentText,
} from './noteSegments';

const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
const B = '01HTASKBBBBBBBBBBBBBBBBBBB';

describe('note segments', () => {
  it('splits a body into text runs around each embedded task', () => {
    const md = `Intro\n{{task:${A}}}\n{{task:${B}}}\nOutro`;
    const segments = noteSegments(md);
    expect(segments.map((s) => s.key)).toEqual([
      `before:${A}`,
      A,
      `before:${B}`,
      B,
      'end',
    ]);
    expect(segments[2]).toMatchObject({ kind: 'text', lines: [] });
    expect(joinSegments(segments)).toBe(md);
  });

  it('round-trips blank lines and a trailing newline unchanged', () => {
    for (const md of ['', '\n', `a\n\n{{task:${A}}}\n\n`, `{{task:${A}}}`]) {
      expect(joinSegments(noteSegments(md))).toBe(md);
    }
  });

  it('leaves embeds inside a code fence as text', () => {
    const md = '```\n{{task:' + A + '}}\n```';
    expect(noteSegments(md).map((s) => s.kind)).toEqual(['text']);
  });

  it('edits one run and keeps the rest of the note as it was', () => {
    const md = `Intro\n{{task:${A}}}\n`;
    const segments = noteSegments(md);
    expect(replaceSegmentText(segments, 'end', 'More')).toBe(
      `Intro\n{{task:${A}}}\nMore`,
    );
    expect(replaceSegmentText(segments, `before:${A}`, '')).toBe(
      `{{task:${A}}}\n`,
    );
    expect(removeSegment(segments, A)).toBe('Intro\n');
  });

  it('turns a task line into an embed with the task syntax parsed', () => {
    const result = convertTaskLine(
      'Plan\n  [ ] Call Sam @mon !high\n',
      1,
      '2026-10-02',
      () => A,
    );
    expect(result).toEqual({
      markdown: `Plan\n  {{task:${A}}}\n`,
      create: {
        id: A,
        draft: {
          title: 'Call Sam',
          startDate: '2026-10-05',
          someday: false,
          dueDate: null,
          priority: 'high',
        },
      },
    });
  });

  it('leaves other lines, empty tasks and fenced lines alone', () => {
    const id = () => A;
    expect(convertTaskLine('Call Sam', 0, '2026-10-02', id)).toBeNull();
    expect(convertTaskLine('[ ] ', 0, '2026-10-02', id)).toBeNull();
    expect(convertTaskLine('```\n[ ] x\n```', 1, '2026-10-02', id)).toBeNull();
  });

  it('drops converted lines a stale keystroke still carries', () => {
    expect(rebaseText('[ ] One\n[', '', ['[ ] One\n'])).toEqual({
      text: '[',
      pending: ['[ ] One\n'],
    });
    expect(
      rebaseText('[ ] One\n[ ] Two\n[', '', ['[ ] One\n', '[ ] Two\n']),
    ).toEqual({ text: '[', pending: ['[ ] One\n', '[ ] Two\n'] });
    expect(rebaseText('[ ] Two\n[', '', ['[ ] One\n', '[ ] Two\n'])).toEqual({
      text: '[',
      pending: ['[ ] Two\n'],
    });
  });

  it('takes a keystroke as typed once the view has the converted text', () => {
    expect(rebaseText('[ ] One', '[ ] On', ['[ ] One\n'])).toEqual({
      text: '[ ] One',
      pending: [],
    });
    expect(rebaseText('[ ] One\nx', '[ ] One\n', ['[ ] One\n'])).toEqual({
      text: '[ ] One\nx',
      pending: [],
    });
  });

  it('finds the lines a typed or pasted line break ends', () => {
    expect(endedLines('[ ] One', '[ ] One\n')).toEqual([0]);
    expect(endedLines('a\nb', 'a\nb\nc\nd')).toEqual([1, 2]);
    expect(endedLines('a\nb', 'a\nbc')).toEqual([]);
    expect(endedLines('ab', 'a\nb')).toEqual([0]);
  });

  it('converts the task lines that still read as queued', () => {
    let n = 0;
    const newId = () => `ID${(n += 1)}`;
    const result = convertTaskLines(
      '[ ] One\n[ ] Two\n[ ] Three',
      [
        [0, '[ ] One'],
        [1, '[ ] Tw'],
        [2, '[ ] Three'],
      ],
      '2026-10-02',
      newId,
    );
    expect(result?.markdown).toBe('{{task:ID1}}\n[ ] Two\n{{task:ID2}}');
    expect(result?.creates.map((c) => c.draft.title)).toEqual(['One', 'Three']);
    expect(convertTaskLines('text', [[0, 'text']], '2026-10-02', newId)).toBe(
      null,
    );
  });
});
