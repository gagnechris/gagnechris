import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from './markdown.js';
import { UlidSchema } from './schemas.js';
import {
  carriedInMarkdown,
  findTaskEmbeds,
  parseTaskEmbedLine,
  removeTaskEmbedLines,
  replaceTaskEmbeds,
  taskEmbedFallbackLine,
  taskEmbedIds,
  taskEmbedNesting,
  taskEmbedParents,
  taskEmbedToken,
} from './task-embeds.js';

const A = '01JAAAAAAAAAAAAAAAAAAAAAAA';
const B = '01JBBBBBBBBBBBBBBBBBBBBBBB';

describe('task embeds', () => {
  it('round-trips a token through parseTaskEmbedLine', () => {
    expect(taskEmbedToken(A)).toBe(`{{task:${A}}}`);
    expect(parseTaskEmbedLine(`  ${taskEmbedToken(A)} `)).toEqual({
      id: A,
      indent: '  ',
    });
    expect(parseTaskEmbedLine(`{{task:${A.toLowerCase()}}}`)?.id).toBe(A);
  });

  it('only treats a line holding nothing but the token as an embed', () => {
    expect(parseTaskEmbedLine(`see {{task:${A}}}`)).toBeNull();
    expect(parseTaskEmbedLine(`- {{task:${A}}}`)).toBeNull();
    expect(parseTaskEmbedLine('{{task:not-a-ulid}}')).toBeNull();
  });

  it('skips fenced code and dedupes ids in first-seen order', () => {
    const md = [
      taskEmbedToken(B),
      '```',
      taskEmbedToken(A),
      '```',
      'text',
      taskEmbedToken(A),
      `  ${taskEmbedToken(B)}`,
    ].join('\n');
    expect(findTaskEmbeds(md).map((e) => [e.id, e.line])).toEqual([
      [B, 0],
      [A, 5],
      [B, 6],
    ]);
    expect(taskEmbedIds(md)).toEqual([B, A]);
  });

  it('replaces embed lines and keeps everything else', () => {
    const md = `# Day\r\n${taskEmbedToken(A)}\r\n  ${taskEmbedToken(B)}\r\nend`;
    const out = replaceTaskEmbeds(md, (embed) =>
      taskEmbedFallbackLine(
        embed,
        embed.id === A ? { title: 'Call Sam', status: 'done' } : undefined,
      ),
    );
    expect(out).toBe(
      '# Day\r\n- [x] Call Sam\r\n  - [ ] (deleted task)\r\nend',
    );
  });

  it('strikes a dropped task through so it never reads as open', () => {
    expect(
      taskEmbedFallbackLine(
        { indent: '  ' },
        { title: 'Call Sam', status: 'dropped' },
      ),
    ).toBe('  - [ ] ~~Call Sam~~ (dropped)');
  });

  it('passes through the shared markdown sanitizer intact', () => {
    const html = renderMarkdownToHtml(`before\n\n${taskEmbedToken(A)}\n`);
    expect(html).toContain(`<p>${taskEmbedToken(A)}</p>`);
  });
});

describe('removeTaskEmbedLines', () => {
  it('drops the named embeds and keeps every other line', () => {
    const md = `Plan\n${taskEmbedToken(A)}\n  ${taskEmbedToken(B)}\nend`;
    expect(removeTaskEmbedLines(md, new Set([A]))).toBe(
      `Plan\n  ${taskEmbedToken(B)}\nend`,
    );
  });

  it('leaves a token inside a code fence alone', () => {
    const md = `\`\`\`\n${taskEmbedToken(A)}\n\`\`\`\n${taskEmbedToken(A)}`;
    expect(removeTaskEmbedLines(md, new Set([A]))).toBe(
      `\`\`\`\n${taskEmbedToken(A)}\n\`\`\``,
    );
  });
});

describe('embed ids follow the ULID pattern', () => {
  it.each([
    ['01ARZ3NDEKTSV4RRFFQ48JMTA1', true],
    ['01arz3ndektsv4rrffq48jmta1', true],
    ['81ARZ3NDEKTSV4RRFFQ48JMTA1', false],
    ['01ARZ3NDEKTSV4RRFFQ48JMTAI', false],
    ['01ARZ3NDEKTSV4RRFFQ48JMTA', false],
  ])('%s → %s, same as UlidSchema', (id, ok) => {
    expect(parseTaskEmbedLine(`{{task:${id}}}`) !== null).toBe(ok);
    expect(UlidSchema.safeParse(id).success).toBe(ok);
  });
});

describe('subtasks', () => {
  const C = '01JCCCCCCCCCCCCCCCCCCCCCCC';
  const D = '01JDDDDDDDDDDDDDDDDDDDDDDD';
  const t = (id: string) => `{{task:${id}}}`;

  it('a task line indented under a task line is its subtask, one level deep', () => {
    const md = [t(A), '  context', `  ${t(B)}`, `    ${t(C)}`, t(D)].join('\n');
    expect(taskEmbedParents(md)).toEqual([{ id: B, parentId: A }]);
    expect(
      taskEmbedNesting(md).map((e) => [e.id, e.parentId, e.depth]),
    ).toEqual([
      [A, null, 0],
      [B, A, 1],
      [C, null, 2],
      [D, null, 0],
    ]);
  });

  it('a blank line, a less-indented line or text between them ends the nesting', () => {
    expect(taskEmbedParents([t(A), '', `  ${t(B)}`].join('\n'))).toEqual([]);
    expect(
      taskEmbedParents([t(A), '  text', `    ${t(B)}`].join('\n')),
    ).toEqual([]);
    expect(
      taskEmbedParents(['- list', `  ${t(A)}`, `    ${t(B)}`].join('\n')),
    ).toEqual([{ id: B, parentId: A }]);
    expect(
      taskEmbedParents(['```', t(A), '```', `  ${t(B)}`].join('\n')),
    ).toEqual([]);
  });

  it('Carried in nests a subtask under its parent when both carry in', () => {
    expect(
      carriedInMarkdown([
        { id: B, parentId: A },
        { id: A },
        { id: C, parentId: D },
        { id: D, parentId: null },
      ]),
    ).toBe(`## Carried in\n\n${t(A)}\n  ${t(B)}\n${t(D)}\n  ${t(C)}\n\n`);
    expect(carriedInMarkdown([{ id: B, parentId: A }])).toBe(
      `## Carried in\n\n${t(B)}\n\n`,
    );
  });
});
