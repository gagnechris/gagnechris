import { useEffect, useRef, useState } from 'react';
import { useHydrated } from '../prerender/useHydrated';

const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;
const DEFAULT_STEP = 1;
const TEXT_SIZE_KEY = 'gagnechris.postTextSize';

const readStep = (): number => {
  try {
    const stored = window.localStorage.getItem(TEXT_SIZE_KEY);
    const step = stored === null ? NaN : Number(stored);
    return Number.isInteger(step) && step >= 0 && step < TEXT_SCALES.length
      ? step
      : DEFAULT_STEP;
  } catch {
    return DEFAULT_STEP;
  }
};

const saveStep = (step: number) => {
  try {
    window.localStorage.setItem(TEXT_SIZE_KEY, String(step));
  } catch {
    // Private mode or blocked storage: the size lasts for this page only.
  }
};

const ShareIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);

/**
 * The phone reading bar: text size and Share. Client-only, so the
 * prerendered post is the same with or without it.
 */
export const ReadingBar = ({ title }: { title: string }) => {
  const hydrated = useHydrated();
  const [step, setStep] = useState(readStep);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.style.setProperty('--post-text-scale', String(TEXT_SCALES[step]));
    return () => root.style.removeProperty('--post-text-scale');
  }, [hydrated, step]);

  if (!hydrated) return null;

  const resize = (next: number) => {
    setStep(next);
    saveStep(next);
  };

  const announce = (message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2500);
  };

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closed the share sheet.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      announce('Link copied');
    } catch {
      announce('Could not copy the link');
    }
  };

  return (
    <div className="reading-bar">
      <span className="reading-bar__label">Text size</span>
      <div className="reading-bar__actions">
        <button
          type="button"
          className="reading-bar__button reading-bar__button--smaller"
          aria-label="Smaller text"
          disabled={step === 0}
          onClick={() => resize(step - 1)}
        >
          A
        </button>
        <button
          type="button"
          className="reading-bar__button reading-bar__button--larger"
          aria-label="Larger text"
          disabled={step === TEXT_SCALES.length - 1}
          onClick={() => resize(step + 1)}
        >
          A
        </button>
        <button
          type="button"
          className="reading-bar__button"
          aria-label="Share"
          onClick={() => void share()}
        >
          <ShareIcon />
        </button>
      </div>
      <p className="reading-bar__notice" role="status">
        {notice}
      </p>
    </div>
  );
};
