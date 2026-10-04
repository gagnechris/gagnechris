import { SITE_AUTHOR_NAME } from './site-config.js';

export const WORDS_PER_MINUTE = 230;

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export const countWords = (text: string): number =>
  text.match(WORD)?.length ?? 0;

/**
 * Link and image destinations, reference definitions, code fence info
 * strings, task boxes and inline tags aren't read, so they don't count.
 */
export const readingMinutes = (markdown: string): number => {
  const prose = (markdown ?? '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/^ {0,3}\[[^\]]+\]:\s*\S.*$/gm, '')
    .replace(/^ {0,3}(?:```|~~~).*$/gm, '')
    .replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/gm, '$1')
    .replace(/<[^>\n]+>/g, ' ');
  return Math.max(1, Math.round(countWords(prose) / WORDS_PER_MINUTE));
};

export const POST_META_SEPARATOR = ' · ';

export const readingTimeLabel = (minutes: number): string =>
  `${minutes} min read`;

export const POST_AUTHOR_NOTE = {
  name: SITE_AUTHOR_NAME,
  role: 'is an engineering leader at Ro.',
  about: { label: 'More about me', href: '/' },
  rss: { label: 'RSS', href: '/rss.xml' },
} as const;
