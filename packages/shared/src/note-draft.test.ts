import { describe, expect, test } from 'vitest';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from './note-draft.js';

describe('note draft', () => {
  const note = {
    title: 'Plan',
    bodyMarkdown: 'Body',
    tags: ['work', 'q4'],
    pinned: true,
  };

  test('round-trips a note through its draft', () => {
    expect(noteDraftFromNote(note)).toEqual({
      title: 'Plan',
      bodyMarkdown: 'Body',
      tagsText: 'work, q4',
      pinned: true,
    });
    expect(notePayloadFromDraft(noteDraftFromNote(note))).toEqual(note);
  });

  test('drops empty tags from the text', () => {
    expect(
      notePayloadFromDraft({ ...emptyNoteDraft(), tagsText: ' a, ,b ,' }).tags,
    ).toEqual(['a', 'b']);
  });
});
