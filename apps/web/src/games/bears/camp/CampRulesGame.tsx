import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  trackBearsGameComplete,
  trackBearsGameStart,
  trackBearsTipLinkClick,
} from '../../../utils/analytics';
import { CAMP_ITEM_ACTIONS } from '../facts';
import EndCard from '../shared/EndCard';
import { readHighScore, writeHighScore } from '../shared/highScore';
import { playFailSound, playSecureSound, playSuccessSound } from '../sound';
import { CampBearGlyph, CampItemGlyph, CampScenery } from './campGlyphs';
import {
  CAMP_ITEMS,
  SNACK_LIMIT,
  STEP_MS,
  campItem,
  campPaws,
  campScore,
  campTip,
  createCampState,
  isTargeted,
  makeNoise,
  mostLostItem,
  noiseReady,
  putAway,
  roundProgress,
  secondsLeft,
  stepCamp,
  type CampEvent,
  type CampItemKind,
  type CampRngs,
  type CampState,
} from './campLogic';
import {
  CAMP_SHARE_URL,
  campResultLine,
  campShareText,
  dailyCampKey,
  dailyCampRngs,
  randomCampRngs,
} from './dailyCamp';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import './CampRulesGame.css';

const GAME = 'camp';
const TOAST_MS = 2_200;
const ACTION_LABEL_MS = 1_200;
/** Longest frame we simulate, so a backgrounded tab doesn't fast-forward. */
const MAX_FRAME_MS = 250;

type Screen = 'ready' | 'playing' | 'over';
export type CampMode = 'daily' | 'free';
type Toast = { id: number; text: string };

type CampRulesGameProps = {
  from: string;
  soundOn: boolean;
  dailyKey?: string;
  onModeChange?: (mode: CampMode) => void;
};

// Desktop browsers implement Web Share too, but there the result is copied;
// only touch screens get the share sheet.
function canShareResult(data: ShareData): boolean {
  if (typeof navigator.share !== 'function') return false;
  if (!window.matchMedia?.('(pointer: coarse)').matches) return false;
  try {
    return navigator.canShare ? navigator.canShare(data) : true;
  } catch {
    return false;
  }
}

const ShareIcon = () => (
  <svg
    viewBox="0 0 20 20"
    width="18"
    height="18"
    aria-hidden="true"
    className="camp-share__icon"
  >
    <path
      d="M10 13V3M6 7l4-4 4 4M4 11v5h12v-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function toastFor(event: CampEvent): string | null {
  switch (event.type) {
    case 'guest':
      return campItem(event.kind).guestToast;
    case 'snack':
      return `A bear got into the ${campItem(event.kind).label.toLowerCase()}!`;
    case 'noise':
      return 'You made some noise. The bear wanders off.';
    default:
      return null;
  }
}

const CampRulesGame = ({
  from,
  soundOn,
  dailyKey: dailyKeyProp,
  onModeChange,
}: CampRulesGameProps) => {
  const reducedMotion = usePrefersReducedMotion();
  const dailyKey = useMemo(
    () => dailyKeyProp ?? dailyCampKey(new Date()),
    [dailyKeyProp],
  );
  const [screen, setScreen] = useState<Screen>('ready');
  const [mode, setMode] = useState<CampMode>('daily');
  const [state, setState] = useState<CampState>(createCampState);
  const [toast, setToast] = useState<Toast | null>(null);
  const [justPutAway, setJustPutAway] = useState<{
    kind: CampItemKind;
    at: number;
  } | null>(null);
  const [highScore, setHighScore] = useState(() => readHighScore(GAME));
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const stateRef = useRef(state);
  const rngsRef = useRef<CampRngs>(dailyCampRngs(dailyKey));
  const soundOnRef = useRef(soundOn);
  const toastSeq = useRef(0);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const handleEvents = useCallback(
    (events: CampEvent[]) => {
      for (const event of events) {
        const text = toastFor(event);
        if (text) {
          toastSeq.current += 1;
          setToast({ id: toastSeq.current, text });
        }
        if (event.type === 'putAway') {
          setJustPutAway({ kind: event.kind, at: stateRef.current.t });
          if (soundOnRef.current) playSecureSound();
        }
        if (event.type === 'snack' && soundOnRef.current) playFailSound();
        if (event.type === 'end') {
          const final = stateRef.current;
          const score = campScore(final);
          setScreen('over');
          trackBearsGameComplete(GAME, from, score);
          if (score > readHighScore(GAME)) {
            writeHighScore(GAME, score);
            setHighScore(score);
          }
          if (soundOnRef.current) {
            if (event.phase === 'dark') playSuccessSound();
            else playFailSound();
          }
        }
      }
    },
    [from],
  );

  const commit = useCallback(
    (result: { state: CampState; events: CampEvent[] }) => {
      stateRef.current = result.state;
      setState(result.state);
      handleEvents(result.events);
    },
    [handleEvents],
  );

  useEffect(() => {
    if (screen !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += Math.min(MAX_FRAME_MS, now - last);
      last = now;
      let next = stateRef.current;
      const events: CampEvent[] = [];
      while (acc >= STEP_MS && next.phase === 'playing') {
        const r = stepCamp(next, rngsRef.current);
        next = r.state;
        events.push(...r.events);
        acc -= STEP_MS;
      }
      if (next !== stateRef.current) commit({ state: next, events });
      if (next.phase === 'playing') frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [screen, commit]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const begin = (nextMode: CampMode) => {
    rngsRef.current =
      nextMode === 'daily' ? dailyCampRngs(dailyKey) : randomCampRngs();
    const fresh = createCampState();
    stateRef.current = fresh;
    setState(fresh);
    setMode(nextMode);
    onModeChange?.(nextMode);
    setToast(null);
    setJustPutAway(null);
    setCopyStatus('idle');
    setScreen('playing');
    trackBearsGameStart(GAME, from);
  };

  const onPutAway = (kind: CampItemKind) => {
    if (screen !== 'playing') return;
    commit(putAway(stateRef.current, kind));
  };

  const onNoise = (bearId: string) => {
    if (screen !== 'playing') return;
    commit(makeNoise(stateRef.current, bearId));
  };

  const shareData = (final: CampState): ShareData => ({
    title: 'Camp Rules',
    text: campShareText({
      key: dailyKey,
      seconds: Math.floor(final.t / 1000),
      saves: final.saves,
    }),
    url: CAMP_SHARE_URL,
  });

  const onShareResult = async () => {
    const data = shareData(stateRef.current);
    if (!canShareResult(data)) return onCopyResult();
    try {
      await navigator.share(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await onCopyResult();
    }
  };

  const onCopyResult = async () => {
    const final = stateRef.current;
    const line = campResultLine({
      key: dailyKey,
      paws: campPaws(final),
      saves: final.saves,
      score: campScore(final),
      habituated: final.phase === 'habituated',
    });
    try {
      await navigator.clipboard.writeText(line);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const canShare = screen === 'over' && canShareResult(shareData(state));
  const p = roundProgress(state.t);
  const score = campScore(state);
  const habituated = state.phase === 'habituated';
  const worst = mostLostItem(state);
  const noiseIn = Math.max(0, Math.ceil((state.noiseReadyAt - state.t) / 1000));
  const showAction =
    justPutAway && state.t - justPutAway.at < ACTION_LABEL_MS
      ? justPutAway.kind
      : null;

  return (
    <div className={`camp${reducedMotion ? ' camp--reduced' : ''}`}>
      <div className="camp-hud">
        <div className="camp-hud__stat">
          <span className="camp-hud__label camp-hud__long">Time left</span>
          <span className="camp-hud__label camp-hud__short">Time</span>
          <span className="camp-hud__value">{secondsLeft(state)}s</span>
        </div>
        <div className="camp-hud__stat">
          <span className="camp-hud__label camp-hud__long">Bear snacks</span>
          <span className="camp-hud__label camp-hud__short">Snacks</span>
          <span
            className="camp-hud__meter"
            role="img"
            aria-label={`Bear snacks: ${state.snacks} of ${SNACK_LIMIT}`}
          >
            {Array.from({ length: SNACK_LIMIT }, (_, k) => (
              <span
                key={k}
                className={
                  k < state.snacks
                    ? 'camp-hud__slot camp-hud__slot--full'
                    : 'camp-hud__slot'
                }
              />
            ))}
            <span className="camp-hud__count">
              {state.snacks}/{SNACK_LIMIT}
            </span>
          </span>
        </div>
        <div className="camp-hud__stat">
          <span className="camp-hud__label">Saves</span>
          <span className="camp-hud__value">{state.saves}</span>
        </div>
        <div className="camp-hud__stat">
          <span className="camp-hud__label">Score</span>
          <span className="camp-hud__value">{score}</span>
        </div>
        <span className="camp-hud__noise">
          {screen === 'playing'
            ? noiseReady(state)
              ? 'Tap a bear to make noise'
              : `Noise recharging… ${noiseIn}s`
            : ''}
        </span>
      </div>

      <div className="camp-field">
        <CampScenery />

        {CAMP_ITEMS.map(({ kind, label, x, y }) => {
          const isOut = state.out[kind];
          const targeted = isOut && isTargeted(state, kind);
          const badge = isOut
            ? targeted
              ? 'Bear coming!'
              : 'Out'
            : showAction === kind
              ? CAMP_ITEM_ACTIONS[kind].text
              : 'Put away';
          return (
            <button
              key={kind}
              type="button"
              className={[
                'camp-item',
                `camp-item--${kind}`,
                isOut ? 'camp-item--out' : 'camp-item--away',
                targeted ? 'camp-item--targeted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-disabled={!isOut || screen !== 'playing'}
              aria-label={
                isOut
                  ? `${label}, ${targeted ? 'a bear is coming' : 'out'}. Activate to put it away: ${CAMP_ITEM_ACTIONS[kind].text.toLowerCase()}.`
                  : `${label}, put away.`
              }
              tabIndex={screen === 'playing' ? 0 : -1}
              onClick={() => onPutAway(kind)}
            >
              {isOut ? (
                <span className="camp-item__smell" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
              <CampItemGlyph kind={kind} />
              <span className="camp-item__label">{label}</span>
              <span className="camp-item__badge">{badge}</span>
            </button>
          );
        })}

        {state.bears.map((bear) => (
          <button
            key={bear.id}
            type="button"
            className={
              bear.leaving ? 'camp-bear camp-bear--leaving' : 'camp-bear'
            }
            style={{ left: `${bear.x}%`, top: `${bear.y}%` }}
            aria-label={
              bear.leaving
                ? 'Bear leaving'
                : `Bear heading for the ${campItem(bear.target).label.toLowerCase()}. Activate to make noise.`
            }
            aria-disabled={bear.leaving || !noiseReady(state)}
            tabIndex={screen === 'playing' && !bear.leaving ? 0 : -1}
            onClick={() => onNoise(bear.id)}
          >
            <span className="camp-bear__body">
              <CampBearGlyph />
            </span>
          </button>
        ))}

        <div
          className="camp-field__dusk"
          style={{ opacity: 0.5 * p }}
          aria-hidden="true"
        />

        <div className="camp-toast-region" role="status" aria-live="polite">
          {toast ? (
            <span key={toast.id} className="camp-toast">
              {toast.text}
            </span>
          ) : null}
        </div>

        {screen === 'ready' ? (
          <div className="camp-overlay">
            <section className="camp-start" aria-labelledby="camp-start-title">
              <h2 id="camp-start-title">Keep camp bear-safe until dark</h2>
              <ul>
                <li>
                  Your guests keep leaving food out. Tap anything with smell
                  lines to put it away.
                </li>
                <li>
                  A bear that gets a snack fills the meter. Three snacks and the
                  bears are too used to your camp.
                </li>
                <li>
                  Tap a bear to make noise from where you are and send it off.
                  It needs a few seconds to recharge.
                </li>
              </ul>
              <button
                type="button"
                className="bears-btn bears-btn--primary camp-start__go"
                onClick={() => begin('daily')}
              >
                Start the evening
              </button>
              <button
                type="button"
                className="camp-link-btn"
                onClick={() => begin('free')}
              >
                Or play a random camp
              </button>
            </section>
          </div>
        ) : null}

        {screen === 'over' ? (
          <div className="camp-overlay camp-overlay--end">
            <EndCard
              game={GAME}
              from={from}
              outcome={habituated ? 'lose' : 'win'}
              kicker={
                habituated
                  ? 'The bears got too comfortable'
                  : 'Camp made it to dark'
              }
              title={
                habituated
                  ? 'Three snacks, and the bears learned your camp means food.'
                  : state.snacks === 0
                    ? 'Not a single bear snack. Perfect evening.'
                    : 'You held camp together until dark.'
              }
              paws={campPaws(state)}
              summary={`${Math.floor(state.t / 1000)}s · ${state.saves} ${state.saves === 1 ? 'save' : 'saves'} · score ${score}`}
              className="camp-end"
              stats={[
                { label: 'Time', value: `${Math.floor(state.t / 1000)}s` },
                { label: 'Saves', value: state.saves },
                { label: 'Score', value: score },
                { label: 'Best', value: Math.max(highScore, score) },
              ]}
              tip={campTip(state)}
              tipKicker={worst ? 'What got you' : 'Bear tip'}
              onPlayAgain={() => begin(mode)}
              onTipLinkClick={() => trackBearsTipLinkClick(from, GAME)}
              extraActions={
                <>
                  {mode === 'daily' ? (
                    <button
                      type="button"
                      className="camp-link-btn camp-share"
                      onClick={() => void onShareResult()}
                    >
                      {copyStatus === 'copied' ? (
                        'Copied!'
                      ) : copyStatus === 'failed' ? (
                        'Couldn’t copy'
                      ) : canShare ? (
                        <>
                          <ShareIcon />
                          Share result
                        </>
                      ) : (
                        'Copy result'
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="camp-link-btn"
                    onClick={() => begin(mode === 'daily' ? 'free' : 'daily')}
                  >
                    {mode === 'daily' ? 'Random camp' : 'Today’s camp'}
                  </button>
                </>
              }
            />
          </div>
        ) : null}
      </div>

      <p className="camp-note">
        Keyboard: Tab to an item or bear, Enter to act.{' '}
        {mode === 'daily'
          ? `Daily camp for ${dailyKey}: everyone gets the same evening each day.`
          : 'Random camp: a new evening every time.'}
      </p>
    </div>
  );
};

export default CampRulesGame;
