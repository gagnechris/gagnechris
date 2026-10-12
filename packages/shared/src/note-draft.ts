import { parseTagsText } from './tags-text.js';

export type NoteDraft = {
  title: string;
  bodyMarkdown: string;
  tagsText: string;
  pinned: boolean;
};

type DraftableNote = {
  title: string;
  bodyMarkdown: string;
  tags: readonly string[];
  pinned: boolean;
};

export const emptyNoteDraft = (): NoteDraft => ({
  title: '',
  bodyMarkdown: '',
  tagsText: '',
  pinned: false,
});

export const noteDraftFromNote = (note: DraftableNote): NoteDraft => ({
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
