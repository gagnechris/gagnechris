import { describe, expect, it } from 'vitest';
import { applyToolbarAction, type ToolbarAction } from './toolbarEdits';

/** `|` marks the caret and `«…»` a selection, in both input and output. */
const run = (marked: string, action: ToolbarAction) => {
  const caret = marked.indexOf('|');
  const start = caret >= 0 ? caret : marked.indexOf('«');
  const text = marked.replace(/[|«»]/g, '');
  const end = caret >= 0 ? start : marked.indexOf('»') - 1;
  const out = applyToolbarAction(text, { start, end }, action);
  const { start: s, end: e } = out.selection;
  return s === e
    ? `${out.text.slice(0, s)}|${out.text.slice(s)}`
    : `${out.text.slice(0, s)}«${out.text.slice(s, e)}»${out.text.slice(e)}`;
};

describe('Notes keyboard toolbar', () => {
  it('Task starts the caret line with a checkbox, after its indent', () => {
    expect(run('Call Sam|', 'task')).toBe('[ ] Call Sam|');
    expect(run('a\n  Call| Sam', 'task')).toBe('a\n  [ ] Call| Sam');
    expect(run('|', 'task')).toBe('[ ] |');
  });

  it('Task takes the checkbox off a line that has one', () => {
    expect(run('[ ] Call Sam|', 'task')).toBe('Call Sam|');
    expect(run('[ ] |', 'task')).toBe('|');
  });

  it('H and List toggle their marker on the caret line only', () => {
    expect(run('one\ntw|o\nthree', 'heading')).toBe('one\n# tw|o\nthree');
    expect(run('## Plan|', 'heading')).toBe('Plan|');
    expect(run('milk|', 'list')).toBe('- milk|');
    expect(run('- milk|', 'list')).toBe('milk|');
  });

  it('the date and priority buttons type @ and ! as a new word', () => {
    expect(run('[ ] Call Sam|', 'date')).toBe('[ ] Call Sam @|');
    expect(run('[ ] Call Sam |', 'date')).toBe('[ ] Call Sam @|');
    expect(run('[ ] Call Sam|', 'priority')).toBe('[ ] Call Sam !|');
    expect(run('|', 'priority')).toBe('!|');
  });

  it('Link wraps the selection and waits for the URL', () => {
    expect(run('see «the docs» now', 'link')).toBe('see [the docs](|) now');
    expect(run('see |', 'link')).toBe('see [|]()');
  });

  it('a selection keeps covering the same words after a line marker', () => {
    expect(run('Call «Sam»', 'task')).toBe('[ ] Call «Sam»');
  });
});
