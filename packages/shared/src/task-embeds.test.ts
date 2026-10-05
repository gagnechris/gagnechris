import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from './markdown.js';
import {
  findTaskEmbeds,
  parseTaskEmbedLine,
  replaceTaskEmbeds,
  taskEmbedFallbackLine,
  taskEmbedIds,
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
