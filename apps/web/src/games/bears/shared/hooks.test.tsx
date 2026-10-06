import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  trackBearsGameComplete,
  trackBearsGameStart,
  trackBearsTipLinkClick,
} from '../../../utils/analytics';
import { playFailSound, playSuccessSound } from '../sound';
import { readHighScore } from './highScore';
import { advance, setupGameTests, stubMedia } from './test-utils';
import { useBearsSession } from './useBearsSession';
import { MAX_FRAME_MS, useFixedStepLoop } from './useFixedStepLoop';
import { useCoarsePointer, usePrefersReducedMotion } from './useMediaQuery';
import { useTimedValue } from './useTimedValue';

vi.mock('../../../utils/analytics', () => ({
  trackBearsGameStart: vi.fn(),
  trackBearsGameComplete: vi.fn(),
  trackBearsTipLinkClick: vi.fn(),
}));

vi.mock('../sound', () => ({
  playFailSound: vi.fn(),
  playSuccessSound: vi.fn(),
}));

setupGameTests();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useFixedStepLoop', () => {
  const renderLoop = (running: boolean, stepsUntilEnd = Infinity) => {
    const step = vi.fn(() => step.mock.calls.length < stepsUntilEnd);
    const frame = vi.fn();
    const hook = renderHook(
      ({ running }) => useFixedStepLoop({ running, stepMs: 100, step, frame }),
      { initialProps: { running } },
    );
    return { step, frame, hook };
  };

  test('steps at the fixed rate, carrying leftover time between frames', () => {
    const { step, frame } = renderLoop(true);

    advance(1_000);

    // About 60 frames for 10 steps of 100ms.
    expect(step.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(step.mock.calls.length).toBeLessThanOrEqual(10);
    expect(frame.mock.calls.length).toBeGreaterThan(50);
  });

  test('a long frame only simulates MAX_FRAME_MS', () => {
    let next: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      next = cb;
      return 1;
    });
    const start = performance.now();
    const { step } = renderLoop(true);

    act(() => next!(start + 10_000));

    expect(MAX_FRAME_MS).toBe(250);
    expect(step).toHaveBeenCalledTimes(2);
  });

  test('stops once step reports the end, and does not run when not running', () => {
    const ended = renderLoop(true, 3);
    advance(1_000);
    expect(ended.step).toHaveBeenCalledTimes(3);
    ended.hook.unmount();

    const idle = renderLoop(false);
    advance(1_000);
    expect(idle.step).not.toHaveBeenCalled();
    expect(idle.frame).not.toHaveBeenCalled();
  });
});

describe('useTimedValue', () => {
  test('clears itself after its duration, restarting on each show', () => {
    const { result } = renderHook(() =>
      useTimedValue<string>((v) => (v === 'long' ? 3_000 : 1_000)),
    );
    expect(result.current[0]).toBeNull();

    act(() => result.current[1]('short'));
    const first = result.current[0]!;
    expect(first.value).toBe('short');
    advance(600);
    act(() => result.current[1]('short'));
    expect(result.current[0]!.id).not.toBe(first.id);
    advance(600);
    expect(result.current[0]?.value).toBe('short');
    advance(500);
    expect(result.current[0]).toBeNull();

    act(() => result.current[1]('long'));
    advance(2_000);
    expect(result.current[0]?.value).toBe('long');
    act(() => result.current[2]());
    expect(result.current[0]).toBeNull();
  });
});

describe('useBearsSession', () => {
  test('tracks the round, keeps the best score and plays the end sound', () => {
    const { result, rerender } = renderHook(
      ({ soundOn }) => useBearsSession('camp', 'contact', soundOn),
      { initialProps: { soundOn: true } },
    );
    expect(result.current.highScore).toBe(0);

    act(() => result.current.start());
    expect(trackBearsGameStart).toHaveBeenCalledWith('camp', 'contact');

    act(() => result.current.finish(300, true));
    expect(trackBearsGameComplete).toHaveBeenCalledWith('camp', 'contact', 300);
    expect(result.current.highScore).toBe(300);
    expect(readHighScore('camp')).toBe(300);
    expect(playSuccessSound).toHaveBeenCalledTimes(1);

    rerender({ soundOn: false });
    act(() => result.current.finish(100, false));
    expect(readHighScore('camp')).toBe(300);
    expect(playFailSound).not.toHaveBeenCalled();

    act(() => result.current.onTipLinkClick());
    expect(trackBearsTipLinkClick).toHaveBeenCalledWith('contact', 'camp');
  });
});

describe('media query hooks', () => {
  test('follow changes to the query', () => {
    let coarse = false;
    const media = stubMedia((q) => q === '(pointer: coarse)' && coarse);
    const { result } = renderHook(() => ({
      coarse: useCoarsePointer(),
      reduced: usePrefersReducedMotion(),
    }));
    expect(result.current).toEqual({ coarse: false, reduced: false });

    coarse = true;
    media.change();
    expect(result.current).toEqual({ coarse: true, reduced: false });
  });
});
