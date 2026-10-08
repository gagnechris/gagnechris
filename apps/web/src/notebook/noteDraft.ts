import type { Note } from '@gagnechris/app-core';
import { parseTagsText } from '@gagnechris/shared';

export type NoteDraft = {
  title: string;
  bodyMarkdown: string;
  tagsText: string;
  pinned: boolean;
};

export const emptyNoteDraft = (): NoteDraft => ({
  title: '',
  bodyMarkdown: '',
  tagsText: '',
  pinned: false,
});

export const noteDraftFromNote = (note: Note): NoteDraft => ({
  title: note.title,
  bodyMarkdown: note.bodyMarkdown,
  tagsText: note.tags.join(', '),
  pinned: note.pinned,
});

export const notePayloadFromDraft = (draft: NoteDraft) => ({
  title: draft.title,
  bodyMarkdown: draft.bodyMarkdown,
  tags: parseTagsText(draft.tagsText),
  pinned: draft.pinned,
});
