import type { BearsGame } from './games';

export const BEARS_LANDING_PATH = '/dont-feed-the-bears';

export const BEARS_GAME_PATHS: Readonly<Record<BearsGame, string>> = {
  camp: `${BEARS_LANDING_PATH}/camp`,
  wild: `${BEARS_LANDING_PATH}/wild`,
};

export function bearsFromParam(searchParams: URLSearchParams): string {
  return searchParams.get('from')?.trim() || 'direct';
}

/** Keeps the entry point (`?from=`) as players move between bears pages. */
export function withFrom(path: string, from: string, hash?: string): string {
  const query =
    from && from !== 'direct' ? `?from=${encodeURIComponent(from)}` : '';
  return `${path}${query}${hash ? `#${hash}` : ''}`;
}

export function otherGame(game: BearsGame): BearsGame {
  return game === 'camp' ? 'wild' : 'camp';
}
