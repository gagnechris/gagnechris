import { describe, expect, it } from 'vitest';
import {
  liveMarkdownLine,
  liveMarkdownLines,
  standaloneMarkdownImage,
} from './markdown-live-preview.js';

const visible = (text: string) => {
  const hidden = liveMarkdownLine(text).marks.filter((m) => m.kind === 'hide');
  return [...text]
    .filter((_, i) => !hidden.some((m) => i >= m.from && i < m.to))
    .join('');
};

describe('liveMarkdownLine', () => {
  it('styles a heading and hides its hashes', () => {
    expect(liveMarkdownLine('## Plan').style).toBe('h2');
    expect(visible('## Plan')).toBe('Plan');
  });

  it('hides inline syntax around the styled text', () => {
    const text = 'a **b** _c_ `d` [e](/f)';
    expect(visible(text)).toBe('a b c d e');
    expect(
      liveMarkdownLine(text)
        .marks.filter((m) => m.kind !== 'hide')
        .map((m) => [m.kind, text.slice(m.from, m.to), m.href]),
    ).toEqual([
      ['code', 'd', undefined],
      ['link', 'e', '/f'],
      ['strong', 'b', undefined],
      ['em', 'c', undefined],
    ]);
  });

  it('leaves syntax inside a code span alone', () => {
    expect(visible('`**x**`')).toBe('**x**');
  });

  it('marks a list bullet but not a checklist item', () => {
    expect(liveMarkdownLine('  - item').marks).toContainEqual({
      from: 2,
      to: 3,
      kind: 'bullet',
    });
    expect(
      liveMarkdownLine('- [ ] todo').marks.some((m) => m.kind === 'bullet'),
    ).toBe(false);
  });

  it('styles a quote and hides its marker', () => {
    expect(liveMarkdownLine('> said').style).toBe('quote');
    expect(visible('> said')).toBe('said');
  });
});

describe('liveMarkdownLines', () => {
  it('marks fenced lines as code without inline marks', () => {
    const lines = liveMarkdownLines('```\n**x**\n```\n**y**');
    expect(lines.map((l) => l.style)).toEqual(['fence', 'code', 'fence', null]);
    expect(lines[1]!.marks).toEqual([]);
    expect(lines[3]!.marks.some((m) => m.kind === 'strong')).toBe(true);
  });

  it('leaves task embed lines plain', () => {
    expect(liveMarkdownLines('{{task:01JAAAAAAAAAAAAAAAAAAAAAAA}}')[0]).toEqual(
      { style: null, marks: [] },
    );
  });

  it('finds a line that holds only an image when asked', () => {
    const md = 'Intro\n\n  ![A cat](/media/cat.jpg)\nSee ![x](/y.png) here';
    expect(liveMarkdownLines(md)[2]!.image).toBeUndefined();
    const lines = liveMarkdownLines(md, { images: true });
    expect(lines[2]!.image).toEqual({
      from: 2,
      to: 26,
      src: '/media/cat.jpg',
      alt: 'A cat',
    });
    expect(lines[3]!.image).toBeUndefined();
  });
});

describe('standaloneMarkdownImage', () => {
  it('takes a title but not trailing text', () => {
    expect(standaloneMarkdownImage('![a](/b.png "B")')?.src).toBe('/b.png');
    expect(standaloneMarkdownImage('![a](/b.png) c')).toBeNull();
  });
});
