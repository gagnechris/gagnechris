import type { Note } from '@gagnechris/app-core';

export type NoteDraft = {
  title: string;
  bodyMarkdown: string;
  tags: string[];
  pinned: boolean;
};

export const emptyNoteDraft = (): NoteDraft => ({
  title: '',
  bodyMarkdown: '',
  tags: [],
  pinned: false,
});

export const noteDraftFromNote = (note: Note): NoteDraft => ({
  title: note.title,
  bodyMarkdown: note.bodyMarkdown,
  tags: note.tags,
  pinned: note.pinned,
});

export const notePayloadFromDraft = (draft: NoteDraft) => ({
  title: draft.title,
  bodyMarkdown: draft.bodyMarkdown,
  tags: draft.tags,
  pinned: draft.pinned,
});
