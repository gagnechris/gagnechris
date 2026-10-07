import { MAX_PAWS } from '../shared/rating';
import { campPaws, campScore, type CampState } from './campLogic';

export const CAMP_SHARE_URL = 'https://gagnechris.com/dont-feed-the-bears/camp';

export type CampResult = {
  key: string;
  seconds: number;
  saves: number;
  score: number;
  paws: number;
  habituated: boolean;
};

export function campResult(state: CampState, key: string): CampResult {
  return {
    key,
    seconds: Math.floor(state.t / 1000),
    saves: state.saves,
    score: campScore(state),
    paws: campPaws(state),
    habituated: state.phase === 'habituated',
  };
}

/** "Oct 4" for the key's date, in English to match the rest of the page. */
export function campShortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const savesLabel = (saves: number) =>
  `${saves} ${saves === 1 ? 'save' : 'saves'}`;

/** Every way the end of an evening is written out. */
export function formatCampResult(r: CampResult): {
  /** The end card line beside the paws. */
  summary: string;
  /** Web Share text, sent with CAMP_SHARE_URL. */
  share: string;
  /** Clipboard line, with the paws and the link. */
  copy: string;
} {
  const pawIcons = '🐾'.repeat(r.paws) + '·'.repeat(MAX_PAWS - r.paws);
  const outcome = r.habituated
    ? 'the bears got too comfortable'
    : 'made it to dark';
  return {
    summary: `${r.seconds}s · ${savesLabel(r.saves)} · score ${r.score}`,
    share: `Camp Rules · ${campShortDate(r.key)} · held ${r.seconds}s, ${savesLabel(r.saves)}`,
    copy: `Camp Rules ${r.key}: ${pawIcons} ${outcome}, ${r.saves} saves, score ${r.score}. ${CAMP_SHARE_URL}`,
  };
}
