import { EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  continueMarkdownList,
  cursorListItemStart,
  selectListItemStart,
} from './listContinuation';

/** `|` marks the cursor. */
function enter(text: string): string | null {
  const head = text.indexOf('|');
  let state = EditorState.create({
    doc: text.replace('|', ''),
    selection: { anchor: head },
  });
  const handled = continueMarkdownList({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  if (!handled) return null;
  const doc = state.doc.toString();
  const at = state.selection.main.head;
  return `${doc.slice(0, at)}|${doc.slice(at)}`;
}

describe('continueMarkdownList', () => {
  it('continues bullets with the same marker and indent', () => {
    expect(enter('- one|')).toBe('- one\n- |');
    expect(enter('  * nested|')).toBe('  * nested\n  * |');
  });

  it('numbers the next item', () => {
    expect(enter('9. nine|')).toBe('9. nine\n10. |');
    expect(enter('1) first|')).toBe('1) first\n2) |');
  });

  it('starts an unchecked box after a checklist item', () => {
    expect(enter('- [x] done|')).toBe('- [x] done\n- [ ] |');
  });

  it('splits an item at the cursor', () => {
    expect(enter('- buy| milk')).toBe('- buy\n- | milk');
  });

  it('ends the list on an empty item', () => {
    expect(enter('- one\n- |')).toBe('- one\n|');
    expect(enter('- [ ] |')).toBe('|');
  });

  it('starts a task line after a task line, at its indent', () => {
    expect(enter('[ ] call Sam|')).toBe('[ ] call Sam\n[ ] |');
    expect(enter('  [ ] book| venue')).toBe('  [ ] book\n  [ ] | venue');
  });

  it('moves a task line down from the start of its text', () => {
    expect(enter('[ ] |call Sam')).toBe('\n[ ] |call Sam');
    expect(enter('[ ] plan\n  [ ] |book')).toBe(
      '[ ] plan\n  [ ] \n  [ ] |book',
    );
  });

  it('clears an empty task line', () => {
    expect(enter('[ ] one\n[ ] |')).toBe('[ ] one\n|');
  });

  it('leaves other lines and the marker itself to the default Enter', () => {
    expect(enter('plain|')).toBeNull();
    expect(enter('[|] task line')).toBeNull();
    expect(enter('-| one')).toBeNull();
  });
});

/** `|` marks the cursor; `^` marks the anchor when it differs. */
function run(command: StateCommand, text: string): string | null {
  const head = text.replace('^', '').indexOf('|');
  const anchorAt = text.replace('|', '').indexOf('^');
  let state = EditorState.create({
    doc: text.replace('|', '').replace('^', ''),
    selection: { anchor: anchorAt >= 0 ? anchorAt : head, head },
  });
  const handled = command({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  if (!handled) return null;
  const doc = state.doc.toString();
  const { anchor, head: at } = state.selection.main;
  if (anchor === at) return `${doc.slice(0, at)}|${doc.slice(at)}`;
  const [a, b] = [Math.min(anchor, at), Math.max(anchor, at)];
  const marks = anchor < at ? ['^', '|'] : ['|', '^'];
  return `${doc.slice(0, a)}${marks[0]}${doc.slice(a, b)}${marks[1]}${doc.slice(b)}`;
}

describe('cursorListItemStart', () => {
  it('goes to the start of the item text past the marker and checkbox', () => {
    expect(run(cursorListItemStart, '- buy milk|')).toBe('- |buy milk');
    expect(run(cursorListItemStart, '  - [ ] call| Sam')).toBe(
      '  - [ ] |call Sam',
    );
    expect(run(cursorListItemStart, '12. twelve|')).toBe('12. |twelve');
  });

  it('leaves the default binding to plain lines and the text start', () => {
    expect(run(cursorListItemStart, 'plain| text')).toBeNull();
    expect(run(cursorListItemStart, '- |buy')).toBeNull();
    expect(run(cursorListItemStart, '|- buy')).toBeNull();
  });

  it('extends the selection with Shift', () => {
    expect(run(selectListItemStart, '- buy milk|')).toBe('- |buy milk^');
  });
});
