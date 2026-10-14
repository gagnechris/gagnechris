import {
  NOTEBOOK_TAGS_MAX,
  NOTEBOOK_TEXT_MAX_BYTES,
  NOTEBOOK_TITLE_MAX_LENGTH,
} from '@gagnechris/shared';

export const NOTEBOOK_TOO_LARGE_MESSAGE = `Too large to save: notes and descriptions are limited to ${NOTEBOOK_TEXT_MAX_BYTES / 1000} KB, titles to ${NOTEBOOK_TITLE_MAX_LENGTH} characters and tags to ${NOTEBOOK_TAGS_MAX}.`;

// Site entities have no per-field caps: their 413 is the stored item or the
// request over its size limit.
export const siteTooLargeMessage = (subject: string): string =>
  `Too large to save: ${subject} is over the size limit. Shorten it and try again.`;
