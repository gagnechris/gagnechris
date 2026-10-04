import { useEffect, type JSX } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import BearTipsList from '../games/bears/shared/BearTipsList';
import BearsPageMeta from '../games/bears/shared/BearsPageMeta';
import { BEARS_PAGE_META } from '../games/bears/shared/pageMeta';
import {
  BEARS_GAME_PATHS,
  bearsFromParam,
  withFrom,
} from '../games/bears/shared/routes';
import { BEAR_GUIDANCE_URL } from '../games/bears/tips';
import {
  trackBearsGamePick,
  trackBearsTipLinkClick,
  type BearsGame,
} from '../utils/analytics';
import '../games/bears/shared/bears-shared.css';
import './DontFeedTheBears.css';

const CampArt = () => (
  <svg
    viewBox="0 0 400 240"
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMax slice"
  >
    <path
      d="M0 120 L50 70 L95 110 L150 50 L210 105 L265 60 L320 108 L370 72 L400 95 L400 240 L0 240 Z"
      fill="#3f7a5f"
    />
    <path
      d="M0 150 L60 105 L120 145 L180 100 L250 150 L310 110 L400 140 L400 240 L0 240 Z"
      fill="#2f5d50"
    />
    <rect x="0" y="170" width="400" height="70" fill="#e9dcc0" />
    <path d="M60 200 L110 130 L160 200 Z" fill="#c2552d" />
    <path d="M100 200 L110 168 L120 200 Z" fill="#7a2e17" />
    <rect x="215" y="176" width="52" height="30" rx="5" fill="#4ea5d9" />
    <rect x="215" y="172" width="52" height="9" rx="4" fill="#2b6f97" />
    <circle cx="300" cy="150" r="12" fill="#f2c9a0" />
    <rect x="290" y="162" width="20" height="30" rx="6" fill="#2d7471" />
    <path
      d="M290 170 L276 158 M310 170 L324 158"
      stroke="#f2c9a0"
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M266 150 l-8 -6 M268 160 l-10 0 M332 150 l8 -6 M330 160 l10 0"
      stroke="#c08a1e"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <rect x="294" y="190" width="5" height="16" fill="#16191d" />
    <rect x="301" y="190" width="5" height="16" fill="#16191d" />
  </svg>
);

const WildArt = () => (
  <svg
    viewBox="0 0 400 240"
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMax slice"
  >
    <circle cx="330" cy="60" r="26" fill="#f4b942" />
    <path
      d="M0 130 L70 80 L130 120 L200 70 L270 118 L340 84 L400 110 L400 240 L0 240 Z"
      fill="#b5652f"
    />
    <path
      d="M0 160 L80 120 L160 158 L240 118 L320 160 L400 130 L400 240 L0 240 Z"
      fill="#8a4b25"
    />
    <rect x="0" y="186" width="400" height="54" fill="#5b7f3a" />
    <g transform="translate(60 168)">
      <circle cx="10" cy="8" r="9" fill="#2f5d50" />
      <circle cx="24" cy="4" r="10" fill="#2f5d50" />
      <circle cx="34" cy="12" r="8" fill="#2f5d50" />
      <circle cx="14" cy="6" r="2.5" fill="#6b2a4a" />
      <circle cx="26" cy="2" r="2.5" fill="#6b2a4a" />
      <circle cx="33" cy="10" r="2.5" fill="#6b2a4a" />
    </g>
    <g transform="translate(175 128)">
      <ellipse cx="55" cy="48" rx="42" ry="25" fill="#1d1a19" />
      <rect x="22" y="58" width="13" height="22" rx="6" fill="#1d1a19" />
      <rect x="70" y="58" width="13" height="22" rx="6" fill="#1d1a19" />
      <circle cx="96" cy="34" r="18" fill="#1d1a19" />
      <circle cx="86" cy="18" r="6.5" fill="#1d1a19" />
      <circle cx="102" cy="17" r="6.5" fill="#1d1a19" />
      <ellipse cx="110" cy="40" rx="10" ry="7.5" fill="#c9a27a" />
      <circle cx="117" cy="37" r="3.4" fill="#1d1a19" />
      <circle cx="100" cy="29" r="2.6" fill="#ffffff" />
      <circle cx="101" cy="29.5" r="1.3" fill="#1d1a19" />
    </g>
    <path
      d="M300 150 q10 -12 20 0 q10 -12 20 0"
      stroke="#16191d"
      strokeWidth="2"
      fill="none"
      opacity=".35"
    />
  </svg>
);

type GameCard = {
  game: BearsGame;
  kicker: string;
  title: string;
  body: string;
  details: string;
  cta: string;
  Art: () => JSX.Element;
};

const GAME_CARDS: readonly GameCard[] = [
  {
    game: 'camp',
    kicker: 'You’re the camper',
    title: 'Camp Rules',
    body: 'Your guests keep leaving food out. Put it away, scare off curious bears, and keep camp safe until dark.',
    details: '60 seconds · tap or keyboard · new camp every day',
    cta: 'Play as the camper',
    Art: CampArt,
  },
  {
    game: 'wild',
    kicker: 'You’re the bear',
    title: 'Stay Wild',
    body: 'Help Maple fatten up on berries and beechnuts and reach the den before winter. Campsite snacks are tempting. Too tempting.',
    details: '3 short levels · keyboard or touch · run, jump, sniff',
    cta: 'Play as the bear',
    Art: WildArt,
  },
];

const DontFeedTheBears = () => {
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const from = bearsFromParam(searchParams);

  // The router doesn't scroll to hashes, and game pages link to #tips.
  useEffect(() => {
    if (hash === '#tips') {
      document.getElementById('tips')?.scrollIntoView();
    }
  }, [hash]);

  const onTipLinkClick = () => trackBearsTipLinkClick(from);

  return (
    <div className="bears-landing">
      <BearsPageMeta meta={BEARS_PAGE_META.landing} />
      <main>
        <section className="bears-landing__intro">
          <p className="bears-landing__kicker">Vermont camp rules</p>
          <h1>Don’t Feed the Bears</h1>
          <p className="bears-landing__lede">
            Two quick games about the same rule, from both sides of the
            campsite.
          </p>
        </section>

        <section className="bears-landing__cards" aria-label="Pick a side">
          {GAME_CARDS.map(
            ({ game, kicker, title, body, details, cta, Art }) => (
              <Link
                key={game}
                to={withFrom(BEARS_GAME_PATHS[game], from)}
                className={`bears-card bears-card--${game}`}
                onClick={() => trackBearsGamePick(game, from)}
              >
                <div className="bears-card__art" aria-hidden="true">
                  <Art />
                </div>
                <div className="bears-card__body">
                  <span className="bears-card__kicker">{kicker}</span>
                  <h2 className="bears-card__title">{title}</h2>
                  <p className="bears-card__text">{body}</p>
                  <p className="bears-card__details">{details}</p>
                  <span className="bears-btn bears-btn--primary bears-card__cta">
                    {cta}
                  </span>
                </div>
              </Link>
            ),
          )}
        </section>

        <section className="bears-landing__note">
          <p>
            Every rule in both games comes from{' '}
            <a
              href={BEAR_GUIDANCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onTipLinkClick}
            >
              Vermont Fish &amp; Wildlife’s guidance on living with black bears
            </a>
            . Just want the short version?{' '}
            <a href="#tips">Skip to the bear tips</a>.
          </p>
          <p className="bears-landing__small">
            Sound is off until you turn it on. Both games work with a keyboard
            and respect reduced motion.
          </p>
        </section>

        <section
          id="tips"
          className="bears-landing__tips"
          aria-labelledby="bears-tips-heading"
        >
          <h2 id="bears-tips-heading">Vermont bear tips</h2>
          <BearTipsList onTipLinkClick={onTipLinkClick} />
        </section>
      </main>
    </div>
  );
};

export default DontFeedTheBears;
