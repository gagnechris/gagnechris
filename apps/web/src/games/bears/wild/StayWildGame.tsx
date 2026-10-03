import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  trackBearsGameComplete,
  trackBearsGameStart,
  trackBearsTipLinkClick,
} from '../../../utils/analytics';
import { usePrefersReducedMotion } from '../camp/usePrefersReducedMotion';
import { BEAR_FACTS } from '../facts';
import EndCard from '../shared/EndCard';
import { readHighScore, writeHighScore } from '../shared/highScore';
import { BEARS_LANDING_PATH, withFrom } from '../shared/routes';
import { playFailSound, playSecureSound, playSuccessSound } from '../sound';
import {
  CAMP_FOOD_LABEL,
  FOOD_LABEL,
  type NaturalFoodKind,
  WILD_LEVELS,
  WORLD_HEIGHT,
} from './wildLevels';
import {
  CAMP_FOOD_GAIN,
  COMFY_LIMIT,
  NO_INPUT,
  STEP_MS,
  WELL_FED_FAT,
  createWildState,
  currentLevel,
  levelSecondsLeft,
  sniffReady,
  stepWild,
  wildPaws,
  wildScore,
  wildTip,
  type WildEvent,
  type WildInput,
  type WildState,
} from './wildLogic';
import {
  CRUMBS_MS,
  MUNCH_MS,
  POPUP_MS,
  cameraTarget,
  renderWild,
  type Effects,
} from './wildRender';
import WildEndScene from './WildEndScene';
import './StayWildGame.css';

const GAME = 'wild';
const MAX_FRAME_MS = 250;
const EAT_TOAST_MS = 1_400;

const CRUMB_COLOR: Readonly<Record<NaturalFoodKind, string>> = {
  greens: '#4f8a3a',
  insects: '#2b2018',
  roots: '#c9a27a',
  berries: '#6b2a4a',
  beechnuts: '#8a5a35',
  acorns: '#a8552a',
  apples: '#c2552d',
};

type EatToast = { id: number; text: string; tone: 'good' | 'bad' };

const formatGain = (gain: number) =>
  Number.isInteger(gain) ? String(gain) : gain.toFixed(1);

type Screen = 'ready' | 'playing' | 'paused' | 'over';

type StayWildGameProps = {
  from: string;
  soundOn: boolean;
};

function announce(event: WildEvent, state: WildState): string | null {
  const fat = Math.round(state.fat);
  switch (event.type) {
    case 'eat':
      return `Maple ate ${FOOD_LABEL[event.kind]}. Winter fat ${fat}%.`;
    case 'campSnack':
      return `Maple ate ${CAMP_FOOD_LABEL[event.kind]}. Easy food, but people noticed: ${event.comfy} of ${COMFY_LIMIT}.`;
    case 'sniff':
      return 'Sniff! Hidden food nearby shows up for a moment.';
    case 'clap':
      return 'A camper clapped and shouted. Maple turned back.';
    case 'bark':
      return 'A dog barked. Maple turned back.';
    case 'car':
      return 'A car is coming. Maple waits at the edge of the road.';
    case 'level': {
      const next = WILD_LEVELS[event.level + 1];
      return next
        ? `${next.title}, level ${event.level + 2} of ${WILD_LEVELS.length}: ${next.goal}.`
        : null;
    }
    default:
      return null;
  }
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const StayWildGame = ({ from, soundOn }: StayWildGameProps) => {
  const reducedMotion = usePrefersReducedMotion();
  const [screen, setScreen] = useState<Screen>('ready');
  const [state, setState] = useState<WildState>(() => createWildState());
  const [message, setMessage] = useState('');
  const [touch, setTouch] = useState(false);
  const [highScore, setHighScore] = useState(() => readHighScore(GAME));
  const [eatToast, setEatToast] = useState<EatToast | null>(null);
  const [fatFlash, setFatFlash] = useState(0);
  const effectsRef = useRef<Effects>({ popups: [], crumbs: [], munchUntil: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const inputRef = useRef<WildInput>({ ...NO_INPUT });
  const cameraRef = useRef(0);
  const viewWidthRef = useRef(1280);
  const soundOnRef = useRef(soundOn);
  const screenRef = useRef(screen);
  const reducedRef = useRef(reducedMotion);

  useEffect(() => {
    soundOnRef.current = soundOn;
    screenRef.current = screen;
    reducedRef.current = reducedMotion;
  }, [soundOn, screen, reducedMotion]);

  useEffect(() => {
    const mql = window.matchMedia?.('(pointer: coarse)');
    if (!mql) return;
    const sync = () => setTouch(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const s = stateRef.current;
    const W = viewWidthRef.current;
    const target = cameraTarget(s, W);
    // Reduced motion: ease the camera instead of locking it to Maple.
    cameraRef.current = reducedRef.current
      ? cameraRef.current + (target - cameraRef.current) * 0.08
      : target;
    const scale = canvas.height / WORLD_HEIGHT;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const fx = effectsRef.current;
    fx.popups = fx.popups.filter((p) => time - p.bornAt < POPUP_MS);
    fx.crumbs = fx.crumbs.filter((c) => time - c.bornAt < CRUMBS_MS);
    renderWild(ctx, s, {
      viewWidth: W,
      cameraX: cameraRef.current,
      time,
      reducedMotion: reducedRef.current,
      effects: fx,
    });
  }, []);

  // Keep the canvas sized to its box; logical height is fixed, width follows.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      viewWidthRef.current = (WORLD_HEIGHT * rect.width) / rect.height;
      draw(performance.now());
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [draw]);

  const handleEvents = useCallback(
    (events: WildEvent[], s: WildState) => {
      for (const event of events) {
        const text = announce(event, s);
        if (text) setMessage(text);
        if (event.type === 'eat' || event.type === 'campSnack') {
          const now = performance.now();
          const fx = effectsRef.current;
          const good = event.type === 'eat';
          const gainText = good
            ? formatGain(event.gain)
            : String(CAMP_FOOD_GAIN);
          fx.popups.push({
            text: `+${gainText}%`,
            x: event.x,
            y: Math.min(event.y, s.maple.y) - 28,
            bornAt: now,
            tone: good ? 'good' : 'bad',
          });
          fx.crumbs.push({
            x: event.x,
            y: event.y,
            bornAt: now,
            color: good ? CRUMB_COLOR[event.kind] : '#f4b942',
          });
          fx.munchUntil = now + MUNCH_MS;
          setEatToast({
            id: now,
            tone: good ? 'good' : 'bad',
            text: good
              ? `+${gainText}% ${FOOD_LABEL[event.kind]}`
              : `+${gainText}% fat… but people noticed Maple (${event.comfy} of ${COMFY_LIMIT})`,
          });
          setFatFlash((n) => n + 1);
        }
        if (soundOnRef.current) {
          if (event.type === 'eat') playSecureSound();
          if (
            event.type === 'campSnack' ||
            event.type === 'clap' ||
            event.type === 'bark' ||
            event.type === 'car'
          ) {
            playFailSound();
          }
        }
        if (event.type === 'end') {
          const score = wildScore(s);
          setScreen('over');
          trackBearsGameComplete(GAME, from, score);
          if (score > readHighScore(GAME)) {
            writeHighScore(GAME, score);
            setHighScore(score);
          }
          if (soundOnRef.current) {
            if (event.phase === 'den') playSuccessSound();
            else playFailSound();
          }
        }
      }
    },
    [from],
  );

  useEffect(() => {
    if (screen !== 'playing') {
      draw(performance.now());
      return;
    }
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let lastHud = 0;
    const loop = (now: number) => {
      acc += Math.min(MAX_FRAME_MS, now - last);
      last = now;
      let s = stateRef.current;
      const events: WildEvent[] = [];
      while (acc >= STEP_MS && s.phase === 'playing') {
        const input = { ...inputRef.current };
        if (touch) input.right = true;
        const r = stepWild(s, input);
        inputRef.current.jump = false;
        inputRef.current.sniff = false;
        s = r.state;
        events.push(...r.events);
        acc -= STEP_MS;
      }
      stateRef.current = s;
      draw(now);
      // The HUD only needs a few updates a second; events always flush.
      if (events.length || now - lastHud > 150) {
        lastHud = now;
        setState(s);
      }
      if (events.length) handleEvents(events, s);
      if (s.phase === 'playing') frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [screen, touch, draw, handleEvents]);

  const begin = () => {
    const fresh = createWildState();
    stateRef.current = fresh;
    cameraRef.current = 0;
    inputRef.current = { ...NO_INPUT };
    effectsRef.current = { popups: [], crumbs: [], munchUntil: 0 };
    setEatToast(null);
    setState(fresh);
    setMessage(
      `${WILD_LEVELS[0]!.title}, level 1 of ${WILD_LEVELS.length}: ${WILD_LEVELS[0]!.goal}.`,
    );
    setScreen('playing');
    trackBearsGameStart(GAME, from);
    stageRef.current?.focus();
  };

  useEffect(() => {
    if (!eatToast) return;
    const id = window.setTimeout(() => setEatToast(null), EAT_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [eatToast]);

  const togglePause = useCallback(() => {
    const cur = screenRef.current;
    if (cur === 'playing') setScreen('paused');
    else if (cur === 'paused') setScreen('playing');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const cur = screenRef.current;
      if (cur !== 'playing' && cur !== 'paused') return;
      const k = e.key;
      if (down && (k === 'Escape' || k === 'p' || k === 'P')) {
        e.preventDefault();
        togglePause();
        return;
      }
      if (cur !== 'playing') return;
      const input = inputRef.current;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.left = down;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.right = down;
      else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        if (down && !e.repeat) input.jump = true;
      } else if (k === 's' || k === 'S') {
        if (down && !e.repeat) input.sniff = true;
      } else return;
      e.preventDefault();
    };
    const keydown = (e: KeyboardEvent) => onKey(e, true);
    const keyup = (e: KeyboardEvent) => onKey(e, false);
    const onHidden = () => {
      if (document.hidden && screenRef.current === 'playing')
        setScreen('paused');
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [togglePause]);

  const level = currentLevel(state);
  const fat = Math.round(state.fat);
  const habituated = state.phase === 'habituated';
  const ready = sniffReady(state);
  const wellFed = state.fat >= WELL_FED_FAT;

  return (
    <div className={`wild${touch ? ' wild--touch' : ''}`}>
      <div
        ref={stageRef}
        className={
          screen === 'over' ? 'wild-stage wild-stage--done' : 'wild-stage'
        }
        tabIndex={-1}
        aria-label="Stay Wild. Left and right arrows to move, Space to jump, S to sniff, Escape to pause."
      >
        <canvas
          ref={canvasRef}
          className="wild-canvas"
          role="img"
          aria-label={`Maple in ${level.title.toLowerCase()}. ${level.goal}.`}
        />

        <div className="wild-hud">
          <div className="wild-hud__card wild-hud__level">
            <span className="wild-hud__kicker">
              {level.title} · Level {state.level + 1} of {WILD_LEVELS.length}
            </span>
            <span className="wild-hud__clock">
              {formatClock(levelSecondsLeft(state))}
            </span>
          </div>
          <div className="wild-hud__card wild-hud__fat">
            <span className="wild-hud__fat-row">
              <span className="wild-hud__label">Winter fat</span>
              <span className="wild-hud__label">{fat}%</span>
            </span>
            <span
              key={fatFlash}
              className={
                fatFlash
                  ? 'wild-hud__bar wild-hud__bar--flash'
                  : 'wild-hud__bar'
              }
              role="meter"
              aria-label="Winter fat"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fat}
            >
              <span
                className={
                  wellFed
                    ? 'wild-hud__fill wild-hud__fill--fed'
                    : 'wild-hud__fill'
                }
                style={{ width: `${fat}%` }}
              />
            </span>
          </div>
          <div className="wild-hud__card wild-hud__comfy">
            <span className="wild-hud__label">Too comfy with people</span>
            <span
              className="wild-hud__paws"
              role="img"
              aria-label={`Too comfortable with people: ${state.comfy} of ${COMFY_LIMIT}`}
            >
              {Array.from({ length: COMFY_LIMIT }, (_, k) => (
                <span
                  key={k}
                  className={
                    k < state.comfy
                      ? 'wild-hud__pip wild-hud__pip--on'
                      : 'wild-hud__pip'
                  }
                />
              ))}
            </span>
          </div>
          <button
            type="button"
            className="wild-hud__sniff"
            disabled={screen !== 'playing' || !ready}
            onClick={() => {
              inputRef.current.sniff = true;
            }}
          >
            Sniff <span aria-hidden="true">(S)</span>
          </button>
          <button
            type="button"
            className="wild-hud__pause"
            aria-label={screen === 'paused' ? 'Resume' : 'Pause'}
            disabled={screen !== 'playing' && screen !== 'paused'}
            onClick={togglePause}
          >
            {screen === 'paused' ? '▶' : 'Ⅱ'}
          </button>
        </div>

        {eatToast && screen === 'playing' ? (
          <span
            key={eatToast.id}
            className={`wild-eat-toast wild-eat-toast--${eatToast.tone}`}
            aria-hidden="true"
          >
            {eatToast.text}
          </span>
        ) : null}

        {touch && screen === 'playing' ? (
          <div className="wild-touch">
            <button
              type="button"
              className="wild-touch__sniff"
              disabled={!ready}
              onPointerDown={(e) => {
                e.preventDefault();
                inputRef.current.sniff = true;
              }}
            >
              Sniff
            </button>
            <button
              type="button"
              className="wild-touch__jump"
              onPointerDown={(e) => {
                e.preventDefault();
                inputRef.current.jump = true;
              }}
            >
              Jump
            </button>
          </div>
        ) : null}

        <p className="wild-sr" role="status" aria-live="polite">
          {message}
        </p>

        {screen === 'ready' ? (
          <div className="wild-overlay">
            <section className="wild-start" aria-labelledby="wild-start-title">
              <h2 id="wild-start-title">Help Maple get ready for winter</h2>
              <ul>
                <li>
                  Natural food fills her winter fat: greens, berries, beechnuts,
                  and more.
                </li>
                <li>
                  Campsite food is a big, easy boost, but people start to notice
                  her. Three campsite snacks and she’s too comfortable around
                  people.
                </li>
                <li>Sniff finds insects hidden under logs.</li>
                <li>
                  Campers clap and dogs bark to send her off. Wait for cars at
                  the road.
                </li>
              </ul>
              <p className="wild-start__keys">
                {touch
                  ? 'Maple runs on her own. Tap Jump and Sniff.'
                  : '← → move · Space jump · S sniff · Esc pause'}
              </p>
              <button
                type="button"
                className="bears-btn bears-btn--primary wild-start__go"
                onClick={begin}
              >
                Wake up, Maple
              </button>
            </section>
          </div>
        ) : null}

        {screen === 'paused' ? (
          <div className="wild-overlay">
            <section className="wild-start" aria-labelledby="wild-paused-title">
              <h2 id="wild-paused-title">Paused</h2>
              <button
                type="button"
                className="bears-btn bears-btn--primary wild-start__go"
                onClick={togglePause}
              >
                Resume
              </button>
              <Link
                to={withFrom(BEARS_LANDING_PATH, from)}
                className="bears-btn bears-btn--ghost"
              >
                Quit to Don’t Feed the Bears
              </Link>
            </section>
          </div>
        ) : null}

        <div className="wild-rotate" aria-hidden={!touch}>
          <p>Turn your phone sideways to play Stay Wild.</p>
        </div>
      </div>

      {screen === 'over' ? (
        <div className="wild-end">
          <WildEndScene
            outcome={habituated ? 'habituated' : 'den'}
            reducedMotion={reducedMotion}
          />
          <div className="wild-end__card">
            <EndCard
              game={GAME}
              from={from}
              outcome={habituated ? 'lose' : 'win'}
              kicker={
                habituated ? 'Too comfortable' : 'Maple made it to the den'
              }
              title={
                habituated
                  ? 'Maple got too comfortable around people.'
                  : wellFed
                    ? 'Fat, happy, and still wild. Goodnight, Maple.'
                    : 'A lean winter, but still wild. Goodnight, Maple.'
              }
              lede={
                habituated
                  ? BEAR_FACTS.habituation.text
                  : state.campSnacks > 0
                    ? 'She made it, but she learned that campsites mean food. Next year that could be trouble.'
                    : 'She found her food in the wild all year and stayed away from the campsites.'
              }
              paws={wildPaws(state)}
              stats={[
                { label: 'Winter fat', value: `${fat}%` },
                { label: 'Natural food', value: state.naturalEaten },
                { label: 'Camp snacks', value: state.campSnacks },
                { label: 'Best', value: Math.max(highScore, wildScore(state)) },
              ]}
              tip={wildTip(state)}
              playAgainLabel={
                habituated ? 'Try again, stay wild' : 'Play again'
              }
              onPlayAgain={begin}
              onTipLinkClick={() => trackBearsTipLinkClick(from, GAME)}
            />
          </div>
        </div>
      ) : null}

      <p className="wild-note">
        Keyboard: ← → move, Space jump, S sniff, Esc pause. Score{' '}
        {wildScore(state)}.
      </p>
    </div>
  );
};

export default StayWildGame;
