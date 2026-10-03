import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BearsGame } from '../../../utils/analytics';
import type { BearTip } from '../tips';
import Paws from './Paws';
import { BEARS_GAME_PATHS, otherGame, withFrom } from './routes';

export type EndStat = {
  label: string;
  value: string | number;
};

type EndCardProps = {
  game: BearsGame;
  from: string;
  outcome: 'win' | 'lose';
  kicker: string;
  title: string;
  lede?: string;
  /** 0–3; omit to hide the rating. */
  paws?: number;
  stats: readonly EndStat[];
  tip: BearTip;
  tipKicker?: string;
  playAgainLabel?: string;
  onPlayAgain: () => void;
  onTipLinkClick: () => void;
  extraActions?: ReactNode;
};

const OTHER_SIDE_LABEL: Readonly<Record<BearsGame, string>> = {
  camp: 'Now play as the camper',
  wild: 'Now play as the bear',
};

const EndCard = ({
  game,
  from,
  outcome,
  kicker,
  title,
  lede,
  paws,
  stats,
  tip,
  tipKicker = 'Bear tip',
  playAgainLabel = 'Play again',
  onPlayAgain,
  onTipLinkClick,
  extraActions,
}: EndCardProps) => {
  const titleId = useId();
  const other = otherGame(game);

  return (
    <section
      className={`bears-end bears-end--${outcome}`}
      role="dialog"
      aria-labelledby={titleId}
    >
      <p className="bears-end__kicker">{kicker}</p>
      <h2 id={titleId} className="bears-end__title">
        {title}
      </h2>
      {lede ? <p className="bears-end__lede">{lede}</p> : null}
      {paws === undefined ? null : <Paws count={paws} />}
      <dl className="bears-end__stats">
        {stats.map((s) => (
          <div key={s.label} className="bears-end__stat">
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
      <aside className="bears-end__tip">
        <p className="bears-end__tip-kicker">{tipKicker}</p>
        <h3>{tip.title}</h3>
        <p>{tip.body}</p>
        <a
          href={tip.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onTipLinkClick}
        >
          Vermont Fish &amp; Wildlife source
        </a>
      </aside>
      <div className="bears-end__actions">
        <button
          type="button"
          className="bears-btn bears-btn--primary"
          onClick={onPlayAgain}
        >
          {playAgainLabel}
        </button>
        <Link
          to={withFrom(BEARS_GAME_PATHS[other], from)}
          className="bears-btn bears-btn--ghost"
        >
          {OTHER_SIDE_LABEL[other]}
        </Link>
        {extraActions}
      </div>
    </section>
  );
};

export default EndCard;
