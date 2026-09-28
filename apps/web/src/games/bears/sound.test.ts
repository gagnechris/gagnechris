import { beforeEach, describe, expect, test, vi } from 'vitest';
import { playFailSound, playSecureSound, playSuccessSound } from './sound';

describe('bears game sound', () => {
  const start = vi.fn();
  const stop = vi.fn();
  const connect = vi.fn();
  const setValueAtTime = vi.fn();
  const exponentialRampToValueAtTime = vi.fn();
  const resume = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockReturnValue(undefined);
    const osc = {
      type: 'sine',
      frequency: { value: 0 },
      connect,
      start,
      stop,
    };
    const gain = {
      gain: { setValueAtTime, exponentialRampToValueAtTime },
      connect,
    };
    const ctx = {
      state: 'running',
      currentTime: 0,
      resume,
      createOscillator: () => osc,
      createGain: () => gain,
      destination: {},
    };
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return ctx;
      }),
    );
  });

  test('secure / fail / success schedule oscillators when AudioContext exists', async () => {
    playSecureSound();
    playFailSound();
    playSuccessSound();
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    expect(stop).toHaveBeenCalled();
  });
});
