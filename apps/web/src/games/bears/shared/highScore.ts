import type { BearsGame } from './games';

// Camp's key has no game suffix: renaming it would drop players' saved best scores.
const HIGH_SCORE_KEYS: Readonly<Record<BearsGame, string>> = {
  camp: 'dont-feed-the-bears-high-score',
  wild: 'dont-feed-the-bears-high-score-wild',
};

export function readHighScore(game: BearsGame): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEYS[game]);
    const n = raw == null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeHighScore(game: BearsGame, score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEYS[game], String(score));
  } catch {
    /* private mode / blocked storage */
  }
}
