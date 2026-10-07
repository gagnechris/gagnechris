import { createSeededRng, hashString } from '../shared/rng';
import type { CampRngs } from './campLogic';

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
