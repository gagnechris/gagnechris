import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { continueMarkdownList } from './listContinuation';

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

  it('leaves other lines and the marker itself to the default Enter', () => {
    expect(enter('plain|')).toBeNull();
    expect(enter('[ ] task line|')).toBeNull();
    expect(enter('-| one')).toBeNull();
  });
});
