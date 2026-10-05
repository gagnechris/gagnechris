import { createSeededRng, hashString } from '../shared/rng';
import type { CampRngs } from './campLogic';

export const CAMP_SHARE_URL = 'https://gagnechris.com/dont-feed-the-bears/camp';

/** The player's local calendar date, so "today" matches their clock. */
export function dailyCampKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function seededCampRngs(seed: number): CampRngs {
  return {
    schedule: createSeededRng(seed),
    choice: createSeededRng(seed ^ 0x9e3779b9),
  };
}

export function dailyCampRngs(key: string): CampRngs {
  return seededCampRngs(hashString(`camp-rules:${key}`));
}

export function randomCampRngs(): CampRngs {
  return { schedule: Math.random, choice: Math.random };
}

export type CampResultSummary = {
  key: string;
  paws: number;
  saves: number;
  score: number;
  habituated: boolean;
};

export function campResultLine({
  key,
  paws,
  saves,
  score,
  habituated,
}: CampResultSummary): string {
  const pawIcons = '🐾'.repeat(paws) + '·'.repeat(3 - paws);
  const outcome = habituated
    ? 'the bears got too comfortable'
    : 'made it to dark';
  return `Camp Rules ${key}: ${pawIcons} ${outcome}, ${saves} saves, score ${score}. ${CAMP_SHARE_URL}`;
}

/** "Oct 4" for the key's date, in English to match the rest of the page. */
export function campShortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function campShareText({
  key,
  seconds,
  saves,
}: {
  key: string;
  seconds: number;
  saves: number;
}): string {
  return `Camp Rules · ${campShortDate(key)} · held ${seconds}s, ${saves} ${saves === 1 ? 'save' : 'saves'}`;
}
