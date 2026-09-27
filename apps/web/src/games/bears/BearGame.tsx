import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  trackBearsGameComplete,
  trackBearsGameStart,
  trackBearsTipLinkClick,
} from '../../utils/analytics'
import {
  createInitialState,
  newlySecuredIds,
  securedCount,
  selectTip,
  tick,
  totalAttractants,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type AttractantKind,
  type GameState,
  type InputState,
} from './gameLogic'
import { playFailSound, playSecureSound, playSuccessSound } from './sound'
import { BEAR_GUIDANCE_URL, BEAR_TIPS, type BearTip } from './tips'
import './BearGame.css'

const HIGH_SCORE_KEY = 'dont-feed-the-bears-high-score'
const TICK_MS = 16

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
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-scroller__glyph">
          <rect x="12" y="14" width="24" height="28" rx="3" fill="var(--neutral-600)" />
          <rect x="10" y="10" width="28" height="6" rx="2" fill="var(--neutral-700)" />
        </svg>
      )
    case 'birdFeeder':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-scroller__glyph">
          <rect x="22" y="6" width="4" height="14" fill="var(--primary-800)" />
          <ellipse cx="24" cy="28" rx="12" ry="14" fill="var(--accent-gold)" />
        </svg>
      )
    case 'cooler':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-scroller__glyph">
          <rect x="8" y="16" width="32" height="24" rx="4" fill="var(--accent-blue)" />
          <rect x="8" y="16" width="32" height="8" rx="4" fill="var(--primary-700)" />
        </svg>
      )
    case 'grill':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-scroller__glyph">
          <ellipse cx="24" cy="22" rx="16" ry="10" fill="var(--neutral-700)" />
          <rect x="10" y="22" width="28" height="10" fill="var(--neutral-600)" />
        </svg>
      )
    case 'petFood':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="bear-scroller__glyph">
          <ellipse cx="24" cy="30" rx="16" ry="8" fill="var(--primary-300)" />
          <ellipse cx="24" cy="28" rx="12" ry="5" fill="var(--accent-coral)" opacity="0.85" />
        </svg>
      )
  }
}

function BearGlyph() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="bear-scroller__bear-glyph">
      <circle cx="16" cy="16" r="10" fill="#2a211c" />
      <circle cx="48" cy="16" r="10" fill="#2a211c" />
      <ellipse cx="32" cy="34" rx="22" ry="20" fill="#3d2f28" />
      <ellipse cx="32" cy="40" rx="10" ry="8" fill="#6b5344" />
    </svg>
  )
}

function worldToScreen(
  worldX: number,
  worldY: number,
): { left: number; bottom: number } {
  return {
    left: worldX,
    bottom: worldY,
  }
}

type ViewMode = 'play' | 'tips'

type BearGameProps = {
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

  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    jump: false,
  })
  const jumpLatchRef = useRef(false)
  const soundOnRef = useRef(soundOn)
  const prevPhase = useRef(state.phase)
  const didTrackInitialStart = useRef(false)

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  const startRound = useCallback(
    (nextRound: number) => {
      setReducedMotion(prefersReducedMotion())
      setHighScore(readHighScore())
      setState(createInitialState({ tipIndex: nextRound % BEAR_TIPS.length }))
      setRound(nextRound)
      setView('play')
      inputRef.current = { left: false, right: false, jump: false }
      jumpLatchRef.current = false
      trackBearsGameStart(from)
    },
    [from],
  )

  useEffect(() => {
    if (didTrackInitialStart.current) return
    didTrackInitialStart.current = true
    trackBearsGameStart(from)
  }, [from])

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputRef.current.left = true
        e.preventDefault()
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputRef.current.right = true
        e.preventDefault()
      }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        inputRef.current.jump = true
        jumpLatchRef.current = true
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputRef.current.left = false
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputRef.current.right = false
      }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        inputRef.current.jump = false
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Simulation loop
  useEffect(() => {
    if (view !== 'play' || state.phase !== 'playing') return

    const speedScale = reducedMotion ? 0.75 : 1
    const id = window.setInterval(() => {
      setState((prev) => {
        if (prev.phase !== 'playing') return prev
        const input: InputState = {
          left: inputRef.current.left,
          right: inputRef.current.right,
          jump: jumpLatchRef.current || inputRef.current.jump,
        }
        jumpLatchRef.current = false
        const next = tick(prev, TICK_MS, { input, speedScale })
        const secured = newlySecuredIds(prev, next)
        if (secured.length > 0 && soundOnRef.current) {
          playSecureSound()
        }
        return next
      })
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [view, state.phase, round, reducedMotion])

  useEffect(() => {
    if (state.phase === 'playing') return
    if (state.score > highScore) {
      writeHighScore(state.score)
    }
  }, [state.phase, state.score, highScore])

  useEffect(() => {
    if (prevPhase.current === 'playing' && state.phase !== 'playing') {
      trackBearsGameComplete(from, state.score)
      if (soundOnRef.current) {
        if (state.phase === 'success') playSuccessSound()
        else playFailSound()
      }
    }
    prevPhase.current = state.phase
  }, [state.phase, state.score, from])

  const onTipLinkClick = () => {
    trackBearsTipLinkClick(from)
  }

  const tip: BearTip = selectTip(state)
  const shownHigh = Math.max(highScore, state.score)
  const cam = state.cameraX

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
            Best <strong>{shownHigh}</strong>
          </span>
        </div>
        <div className="bear-game__controls">
          <button
            type="button"
            className="bear-game__btn bear-game__btn--ghost"
            aria-pressed={soundOn}
            onClick={() => setSoundOn((v) => !v)}
            title={
              soundOn
                ? 'Mute game sounds'
                : 'Enable short sound effects (off by default)'
            }
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
        Run right through camp and touch trash, feeders, coolers, grills, and
        pet food to secure them. Jump over bears — a fed bear ends the round.
        Arrow keys / WASD + Space, or the on-screen buttons.
      </p>

      <div
        className="bear-scroller"
        role="application"
        aria-label="Side-scrolling Vermont camp. Use arrow keys or WASD to move, Space to jump. Secure attractants; avoid bears."
      >
        <div
          className="bear-scroller__stage"
          style={{
            width: VIEW_WIDTH,
            height: VIEW_HEIGHT,
          }}
        >
        <div className="bear-scroller__sky" aria-hidden="true" />
        <div className="bear-scroller__trees" aria-hidden="true" />
        <div className="bear-scroller__ground" aria-hidden="true" />

        <div
          className="bear-scroller__world"
          style={{ transform: `translateX(${-cam}px)` }}
        >
          {state.platforms
            .filter((p) => p.id !== 'ground')
            .map((p) => (
              <div
                key={p.id}
                className="bear-scroller__platform"
                style={{
                  left: p.x,
                  bottom: p.y + 58,
                  width: p.w,
                  height: Math.max(p.h, 12),
                }}
                aria-hidden="true"
              />
            ))}

          {state.attractants.map((a) => {
            const screen = worldToScreen(a.x, a.y)
            return (
              <div
                key={a.id}
                className={`bear-scroller__attractant${
                  a.status === 'secured'
                    ? ' bear-scroller__attractant--secured'
                    : ''
                }${
                  state.habituatedAttractantId === a.id
                    ? ' bear-scroller__attractant--hit'
                    : ''
                }`}
                style={{
                  left: screen.left,
                  bottom: screen.bottom + 58,
                  width: a.w,
                  height: a.h,
                }}
                title={a.label}
              >
                <AttractantGlyph kind={a.kind} />
                <span className="bear-scroller__label">{a.label}</span>
              </div>
            )
          })}

          {state.bears.map((b) => (
            <div
              key={b.id}
              className="bear-scroller__bear"
              style={{ left: b.x, bottom: b.y + 58, width: b.w, height: b.h }}
              aria-hidden="true"
            >
              <BearGlyph />
            </div>
          ))}

          <div
            className={`bear-scroller__player${
              state.player.facing < 0 ? ' bear-scroller__player--left' : ''
            }`}
            style={{
              left: state.player.x,
              bottom: state.player.y + 58,
              width: state.player.w,
              height: state.player.h,
            }}
            aria-hidden="true"
          >
            <span className="bear-scroller__player-body" />
          </div>
        </div>

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

      <div className="bear-scroller__pad" aria-label="Touch controls">
        <button
          type="button"
          className="bear-scroller__pad-btn"
          aria-label="Move left"
          onPointerDown={(e) => {
            e.preventDefault()
            inputRef.current.left = true
          }}
          onPointerUp={() => {
            inputRef.current.left = false
          }}
          onPointerLeave={() => {
            inputRef.current.left = false
          }}
          onPointerCancel={() => {
            inputRef.current.left = false
          }}
        >
          ←
        </button>
        <button
          type="button"
          className="bear-scroller__pad-btn bear-scroller__pad-btn--jump"
          aria-label="Jump"
          onPointerDown={(e) => {
            e.preventDefault()
            inputRef.current.jump = true
            jumpLatchRef.current = true
          }}
          onPointerUp={() => {
            inputRef.current.jump = false
          }}
          onPointerLeave={() => {
            inputRef.current.jump = false
          }}
          onPointerCancel={() => {
            inputRef.current.jump = false
          }}
        >
          Jump
        </button>
        <button
          type="button"
          className="bear-scroller__pad-btn"
          aria-label="Move right"
          onPointerDown={(e) => {
            e.preventDefault()
            inputRef.current.right = true
          }}
          onPointerUp={() => {
            inputRef.current.right = false
          }}
          onPointerLeave={() => {
            inputRef.current.right = false
          }}
          onPointerCancel={() => {
            inputRef.current.right = false
          }}
        >
          →
        </button>
      </div>
    </div>
  )
}

export default BearGame
