import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import CampRulesGame from './CampRulesGame';
import {
  trackBearsGameComplete,
  trackBearsGameStart,
} from '../../../utils/analytics';

vi.mock('../../../utils/analytics', () => ({
  trackBearsGameStart: vi.fn(),
  trackBearsGameComplete: vi.fn(),
  trackBearsTipLinkClick: vi.fn(),
}));

const renderGame = (from = 'resume') =>
  render(
    <MemoryRouter>
      <CampRulesGame from={from} soundOn={false} />
    </MemoryRouter>,
  );

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

const start = (label = 'Start the evening') =>
  fireEvent.click(screen.getByRole('button', { name: label }));

describe('CampRulesGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
    });
    vi.setSystemTime(new Date(2026, 9, 3, 18, 0));
    localStorage.clear();
    vi.mocked(trackBearsGameStart).mockClear();
    vi.mocked(trackBearsGameComplete).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('explains the rules and starts today’s camp', () => {
    renderGame();

    expect(
      screen.getByRole('heading', { name: 'Keep camp bear-safe until dark' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Daily camp for 2026-10-03/)).toBeInTheDocument();

    start();

    expect(trackBearsGameStart).toHaveBeenCalledWith('camp', 'resume');
    expect(
      screen.queryByRole('heading', { name: 'Keep camp bear-safe until dark' }),
    ).not.toBeInTheDocument();
  });

  test('items that are out can be put away from the keyboard', () => {
    renderGame();
    start();

    const trash = screen.getByRole('button', { name: /^Trash, out/ });
    expect(trash).toHaveAttribute('tabindex', '0');
    trash.focus();
    fireEvent.click(trash);

    expect(
      screen.getByRole('button', { name: 'Trash, put away.' }),
    ).toBeInTheDocument();
  });

  test('guest toasts are announced in a live region', () => {
    renderGame();
    start();
    for (const kind of ['Trash', 'Cooler', 'Pet food']) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^${kind}, out`) }),
      );
    }

    advance(3_000);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.textContent).toMatch(/guest|trash bag|cooler|grill|bowl/i);
  });

  test('doing nothing ends with the bears too comfortable and a contextual tip', () => {
    renderGame();
    start();

    advance(60_000);

    const card = screen.getByRole('dialog');
    expect(
      within(card).getByText('The bears got too comfortable'),
    ).toBeInTheDocument();
    expect(within(card).getByText('What got you')).toBeInTheDocument();
    expect(
      within(card).getByRole('img', { name: '0 of 3 paws' }),
    ).toBeInTheDocument();
    expect(trackBearsGameComplete).toHaveBeenCalledWith(
      'camp',
      'resume',
      expect.any(Number),
    );
  });

  test('copy result puts a one-line summary on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderGame();
    start();
    advance(60_000);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy result' }));
    });

    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/^Camp Rules 2026-10-03: /),
    );
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  test('random camp has no copy result and can switch back', () => {
    renderGame();
    start('Or play a random camp');
    advance(60_000);

    expect(
      screen.queryByRole('button', { name: 'Copy result' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Random camp: a new evening/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today’s camp' }));
    expect(screen.getByText(/Daily camp for 2026-10-03/)).toBeInTheDocument();
  });

  test('today’s camp plays out the same way twice', () => {
    const runOnce = () => {
      const { unmount } = renderGame();
      start();
      advance(60_000);
      const text = screen.getByRole('dialog').textContent;
      unmount();
      return text;
    };
    expect(runOnce()).toEqual(runOnce());
  });
});
