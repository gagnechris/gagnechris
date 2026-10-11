import { Text } from 'react-native';
import { act } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { allText, render } from '../../test/render';
import { useLocalToday } from './useLocalToday';

const Today = () => <Text>{useLocalToday()}</Text>;

afterEach(() => {
  vi.useRealTimers();
});

it('keeps rolling over after a check that found the same day', async () => {
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9) });
  const renderer = await render(<Today />);
  expect(allText(renderer)).toBe('2026-10-02');

  // The clock moved back, so the midnight check still reads Oct 2.
  vi.setSystemTime(new Date(2026, 9, 1, 23));
  act(() => {
    vi.advanceTimersByTime(15 * 60 * 60 * 1000 + 1_000);
  });
  expect(allText(renderer)).toBe('2026-10-02');

  act(() => {
    vi.advanceTimersByTime(10 * 60 * 60 * 1000 + 2_000);
  });
  expect(allText(renderer)).toBe('2026-10-03');
  act(() => renderer.unmount());
});
