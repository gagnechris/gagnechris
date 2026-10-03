import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useLocalToday } from './useLocalToday';

describe('useLocalToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('rolls over at midnight without any other event', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 23, 59, 0));
    const onRollover = vi.fn();
    const { result } = renderHook(() => useLocalToday(onRollover));
    expect(result.current).toBe('2026-10-20');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe('2026-10-20');

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current).toBe('2026-10-21');
    expect(onRollover).toHaveBeenCalledWith('2026-10-20', '2026-10-21');
  });
});
