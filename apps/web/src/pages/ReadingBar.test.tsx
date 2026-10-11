import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ReadingBar } from './ReadingBar';

const KEY = 'gagnechris.postTextSize';
const scale = () =>
  document.documentElement.style.getPropertyValue('--post-text-scale');

describe('ReadingBar', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  test('steps the post text size, remembers it, and stops at each end', () => {
    const { unmount } = render(<ReadingBar title="Welcome" />);
    expect(scale()).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(scale()).toBe('1.3');
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeDisabled();
    expect(window.localStorage.getItem(KEY)).toBe('3');

    unmount();
    expect(scale()).toBe('');

    render(<ReadingBar title="Next post" />);
    expect(scale()).toBe('1.3');
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    }
    expect(scale()).toBe('0.9');
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeDisabled();
  });

  test('a stored value out of range falls back to the default size', () => {
    window.localStorage.setItem(KEY, '9');
    render(<ReadingBar title="Welcome" />);
    expect(scale()).toBe('1');
  });

  test('Share opens the share sheet with the title and URL', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, share });
    render(<ReadingBar title="Welcome" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });
    expect(share).toHaveBeenCalledWith({
      title: 'Welcome',
      url: window.location.href,
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  test('without Web Share, Share copies the link and says so', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });
    render(<ReadingBar title="Welcome" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  });
});
