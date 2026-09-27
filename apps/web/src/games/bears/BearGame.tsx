import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Link } from 'react-router-dom'
import {
  trackBearsGameComplete,
  trackBearsGameStart,
  trackBearsTipLinkClick,
} from '../../utils/analytics'
import {
  createInitialState,
  secureAttractant,
  selectTip,
  securedCount,
  tick,
  totalAttractants,
  type Attractant,
  type AttractantKind,
  type GameState,
} from './gameLogic'
import { BEAR_GUIDANCE_URL, BEAR_TIPS, type BearTip } from './tips'
import './BearGame.css'

const HIGH_SCORE_KEY = 'dont-feed-the-bears-high-score'
const TICK_MS = 50

function readHighScore(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY)
    const n = raw == null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score))
  } catch {
    /* private mode / blocked storage */
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function AttractantGlyph({ kind }: { kind: AttractantKind }) {
  switch (kind) {
    case 'trash':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-game__glyph">
          <rect x="12" y="14" width="24" height="28" rx="3" fill="var(--neutral-600)" />
          <rect x="10" y="10" width="28" height="6" rx="2" fill="var(--neutral-700)" />
          <line x1="20" y1="20" x2="20" y2="36" stroke="var(--neutral-300)" strokeWidth="2" />
          <line x1="28" y1="20" x2="28" y2="36" stroke="var(--neutral-300)" strokeWidth="2" />
        </svg>
      )
    case 'birdFeeder':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-game__glyph">
          <rect x="22" y="6" width="4" height="14" fill="var(--primary-800)" />
          <ellipse cx="24" cy="28" rx="12" ry="14" fill="var(--accent-gold)" />
          <rect x="18" y="18" width="12" height="4" rx="1" fill="var(--primary-700)" />
          <circle cx="24" cy="30" r="3" fill="var(--neutral-800)" />
        </svg>
      )
    case 'cooler':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-game__glyph">
          <rect x="8" y="16" width="32" height="24" rx="4" fill="var(--accent-blue)" />
          <rect x="8" y="16" width="32" height="8" rx="4" fill="var(--primary-700)" />
          <rect x="18" y="26" width="12" height="4" rx="1" fill="var(--neutral-100)" />
        </svg>
      )
    case 'grill':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-game__glyph">
          <ellipse cx="24" cy="22" rx="16" ry="10" fill="var(--neutral-700)" />
          <rect x="10" y="22" width="28" height="10" fill="var(--neutral-600)" />
          <line x1="14" y1="32" x2="10" y2="42" stroke="var(--neutral-700)" strokeWidth="3" />
          <line x1="34" y1="32" x2="38" y2="42" stroke="var(--neutral-700)" strokeWidth="3" />
          <path d="M18 14c2-4 4-4 6 0" stroke="var(--accent-coral)" strokeWidth="2" fill="none" />
          <path d="M26 12c2-4 4-4 6 0" stroke="var(--accent-gold)" strokeWidth="2" fill="none" />
        </svg>
      )
    case 'petFood':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-game__glyph">
          <ellipse cx="24" cy="30" rx="16" ry="8" fill="var(--primary-300)" />
          <ellipse cx="24" cy="28" rx="12" ry="5" fill="var(--accent-coral)" opacity="0.85" />
          <circle cx="18" cy="27" r="2" fill="var(--neutral-800)" />
          <circle cx="24" cy="26" r="2" fill="var(--neutral-800)" />
          <circle cx="30" cy="27" r="2" fill="var(--neutral-800)" />
        </svg>
      )
  }
}

function BearGlyph() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="bear-game__bear-glyph">
      <circle cx="16" cy="16" r="10" fill="#2a211c" />
      <circle cx="48" cy="16" r="10" fill="#2a211c" />
      <ellipse cx="32" cy="34" rx="22" ry="20" fill="#3d2f28" />
      <ellipse cx="32" cy="40" rx="10" ry="8" fill="#6b5344" />
      <circle cx="24" cy="30" r="3" fill="#f2e8dc" />
      <circle cx="40" cy="30" r="3" fill="#f2e8dc" />
      <ellipse cx="32" cy="36" rx="4" ry="3" fill="#1a1410" />
    </svg>
  )
}

type ViewMode = 'play' | 'tips'

type BearGameProps = {
  /** Soft entry source from `?from=` (CHR-94). */
  from?: string
}

export function BearGame({ from = 'direct' }: BearGameProps) {
  const [view, setView] = useState<ViewMode>('play')
  const [soundOn, setSoundOn] = useState(false)
  const [highScore, setHighScore] = useState(() => readHighScore())
  const [reducedMotion, setReducedMotion] = useState(() => prefersReducedMotion())
  const [round, setRound] = useState(0)
  const [state, setState] = useState<GameState>(() =>
    createInitialState({ tipIndex: 0 }),
  )
  const prevPhase = useRef(state.phase)
  const didTrackInitialStart = useRef(false)

  const startRound = useCallback(
    (nextRound: number) => {
      setReducedMotion(prefersReducedMotion())
      setHighScore(readHighScore())
      setState(
        createInitialState({
          tipIndex: nextRound % BEAR_TIPS.length,
        }),
      )
      setRound(nextRound)
      setView('play')
      trackBearsGameStart(from)
    },
    [from],
  )

  useEffect(() => {
    if (didTrackInitialStart.current) return
    didTrackInitialStart.current = true
    trackBearsGameStart(from)
  }, [from])

  useEffect(() => {
    if (view !== 'play' || state.phase !== 'playing') return

    const speedScale = reducedMotion ? 0.55 : 1
    const id = window.setInterval(() => {
      setState((prev) => {
        if (prev.phase !== 'playing') return prev
        return tick(prev, TICK_MS, { speedScale })
      })
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [view, state.phase, round, reducedMotion])

  // Persist best score to localStorage when a round ends (no React state update).
  useEffect(() => {
    if (state.phase === 'playing') return
    if (state.score > highScore) {
      writeHighScore(state.score)
    }
  }, [state.phase, state.score, highScore])

  useEffect(() => {
    if (prevPhase.current === 'playing' && state.phase !== 'playing') {
      trackBearsGameComplete(from, state.score)
    }
    prevPhase.current = state.phase
  }, [state.phase, state.score, from])

  const onTipLinkClick = () => {
    trackBearsTipLinkClick(from)
  }

  const onSecure = (attractant: Attractant) => {
    if (state.phase !== 'playing' || attractant.status === 'secured') return
    setState((prev) => secureAttractant(prev, attractant.id))
  }

  const onSecureKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    attractant: Attractant,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSecure(attractant)
    }
  }

  const tip: BearTip = selectTip(state)
  const remainingMs = Math.max(0, state.roundDurationMs - state.elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const shownHigh = Math.max(highScore, state.score)

  if (view === 'tips') {
    return (
      <div className="bear-game bear-game--tips">
        <div className="bear-game__toolbar">
          <button
            type="button"
            className="bear-game__btn bear-game__btn--ghost"
            onClick={() => startRound(round)}
          >
            Play the game
          </button>
          <Link to="/" className="bear-game__btn bear-game__btn--ghost">
            Back home
          </Link>
        </div>
        <h2 className="bear-game__tips-heading">Vermont bear tips</h2>
        <p className="bear-game__lede">
          Guidance paraphrased from{' '}
          <a
            href={BEAR_GUIDANCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onTipLinkClick}
          >
            Vermont Fish &amp; Wildlife
          </a>
          .
        </p>
        <ul className="bear-game__tip-list">
          {BEAR_TIPS.map((t) => (
            <li key={t.id} className="bear-game__tip-card">
              <h3>{t.title}</h3>
              <p>{t.body}</p>
              <a
                href={t.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onTipLinkClick}
              >
                Source
              </a>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className={`bear-game${reducedMotion ? ' bear-game--reduced' : ''}`}>
      <div className="bear-game__toolbar">
        <div className="bear-game__stats" aria-live="polite">
          <span>
            Score <strong>{state.score}</strong>
          </span>
          <span>
            Secured{' '}
            <strong>
              {securedCount(state)}/{totalAttractants(state)}
            </strong>
          </span>
          <span>
            Time <strong>{remainingSec}s</strong>
          </span>
          <span>
            Best <strong>{shownHigh}</strong>
          </span>
        </div>
        <div className="bear-game__controls">
          <button
            type="button"
            className="bear-game__btn bear-game__btn--ghost"
            aria-pressed={soundOn}
            onClick={() => setSoundOn((v) => !v)}
            title="Sound is a stub for now — stays silent either way"
          >
            Sound: {soundOn ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            className="bear-game__btn bear-game__btn--ghost"
            onClick={() => setView('tips')}
          >
            Skip the game, show me the bear tips
          </button>
        </div>
      </div>

      <p className="bear-game__lede">
        Secure trash, feeders, coolers, grills, and pet food before a bear
        reaches them. A fed bear is a habituated bear — and that ends the round.
      </p>

      <div
        className="bear-game__field"
        role="application"
        aria-label="Vermont camp playfield. Tab to an attractant and press Enter or Space to secure it."
      >
        <div className="bear-game__sky" aria-hidden="true" />
        <div className="bear-game__trees" aria-hidden="true" />

        {state.attractants.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`bear-game__attractant${
              a.status === 'secured' ? ' bear-game__attractant--secured' : ''
            }${
              state.habituatedAttractantId === a.id
                ? ' bear-game__attractant--hit'
                : ''
            }`}
            style={{ left: `${a.x}%`, top: `${a.y}%` }}
            disabled={state.phase !== 'playing' || a.status === 'secured'}
            onClick={() => onSecure(a)}
            onKeyDown={(e) => onSecureKey(e, a)}
            aria-label={`${a.label}${a.status === 'secured' ? ', secured' : ', unsecured — activate to secure'}`}
          >
            <AttractantGlyph kind={a.kind} />
            <span className="bear-game__attractant-label">{a.label}</span>
          </button>
        ))}

        {state.bears.map((b) => (
          <div
            key={b.id}
            className="bear-game__bear"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            aria-hidden="true"
          >
            <BearGlyph />
          </div>
        ))}

        {state.phase !== 'playing' && (
          <div
            className="bear-game__end"
            role="dialog"
            aria-labelledby="bear-end-title"
          >
            <h2 id="bear-end-title">
              {state.phase === 'success' ? 'Camp secured!' : 'Bear got a snack'}
            </h2>
            <p>
              You secured {securedCount(state)} of {totalAttractants(state)}{' '}
              attractants · Score {state.score}
              {state.score >= shownHigh && state.score > 0 ? ' · New best!' : ''}
            </p>
            <blockquote className="bear-game__end-tip">
              <strong>{tip.title}</strong>
              <p>{tip.body}</p>
              <a
                href={tip.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onTipLinkClick}
              >
                Vermont Fish &amp; Wildlife source
              </a>
            </blockquote>
            <div className="bear-game__end-actions">
              <button
                type="button"
                className="bear-game__btn bear-game__btn--primary"
                onClick={() => startRound(round + 1)}
              >
                Play again
              </button>
              <Link to="/" className="bear-game__btn bear-game__btn--ghost">
                Back home
              </Link>
              <button
                type="button"
                className="bear-game__btn bear-game__btn--ghost"
                onClick={() => setView('tips')}
              >
                More tips
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BearGame
