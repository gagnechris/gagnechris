import {
  NOTEBOOK_TAGS_MAX,
  NOTEBOOK_TEXT_MAX_BYTES,
  NOTEBOOK_TITLE_MAX_LENGTH,
} from '@gagnechris/shared';

export const NOTEBOOK_TOO_LARGE_MESSAGE = `Too large to save: notes and descriptions are limited to ${NOTEBOOK_TEXT_MAX_BYTES / 1000} KB, titles to ${NOTEBOOK_TITLE_MAX_LENGTH} characters and tags to ${NOTEBOOK_TAGS_MAX}.`;

// Site entities have no per-field 413; only the request size cap returns one.
export const siteTooLargeMessage = (subject: string): string =>
  `Too large to save: ${subject} is over the request size limit. Shorten it and try again.`;
