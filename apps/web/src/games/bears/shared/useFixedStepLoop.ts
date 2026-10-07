import { useEffect, useRef } from 'react';

/** Longest frame simulated, so a backgrounded tab doesn't fast-forward. */
export const MAX_FRAME_MS = 250;

type FixedStepLoop = {
  running: boolean;
  stepMs: number;
  /** Advances the game one step; returns false once the run is over. */
  step: () => boolean;
  /** After each frame's steps, e.g. to draw or commit state. */
  frame: (now: number) => void;
};

/**
 * Drives a fixed-step simulation from requestAnimationFrame, so a seed replays
 * the same at any frame rate. Stops by itself once `step` reports the end.
 */
export function useFixedStepLoop({
  running,
  stepMs,
  step,
  frame,
}: FixedStepLoop): void {
  const stepRef = useRef(step);
  const frameRef = useRef(frame);

  useEffect(() => {
    stepRef.current = step;
    frameRef.current = frame;
  });

  useEffect(() => {
    if (!running) return;
    let handle = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += Math.min(MAX_FRAME_MS, now - last);
      last = now;
      let alive = true;
      while (acc >= stepMs && alive) {
        alive = stepRef.current();
        acc -= stepMs;
      }
      frameRef.current(now);
      if (alive) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [running, stepMs]);
}
