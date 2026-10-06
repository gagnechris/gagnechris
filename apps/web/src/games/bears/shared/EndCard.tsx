import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BearsGame } from './games';
import type { BearTip } from '../tips';
import Paws from './Paws';
import {
  BEARS_GAME_PATHS,
  BEARS_LANDING_PATH,
  otherGame,
  withFrom,
} from './routes';

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
  /** One-line stats beside the paws; hidden unless the page CSS shows it. */
  summary?: string;
  stats: readonly EndStat[];
  tip: BearTip;
  tipKicker?: string;
  playAgainLabel?: string;
  onPlayAgain: () => void;
  onTipLinkClick: () => void;
  extraActions?: ReactNode;
  className?: string;
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
  summary,
  stats,
  tip,
  tipKicker = 'Bear tip',
  playAgainLabel = 'Play again',
  onPlayAgain,
  onTipLinkClick,
  extraActions,
  className,
}: EndCardProps) => {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const other = otherGame(game);

  // The game controls that held focus are gone once the round ends.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section
      className={`bears-end bears-end--${outcome}${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
    >
      <p className="bears-end__kicker">{kicker}</p>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="bears-end__title"
      >
        {title}
      </h2>
      {lede ? <p className="bears-end__lede">{lede}</p> : null}
      {summary === undefined ? (
        paws === undefined ? null : (
          <Paws count={paws} />
        )
      ) : (
        <div className="bears-end__rating">
          {paws === undefined ? null : <Paws count={paws} />}
          <p className="bears-end__summary">{summary}</p>
        </div>
      )}
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
      <Link to={withFrom(BEARS_LANDING_PATH, from)} className="bears-end__back">
        <span aria-hidden="true" className="bears-arrow">
          ←
        </span>
        Back to Don’t Feed the Bears
      </Link>
    </section>
  );
};

export default EndCard;
