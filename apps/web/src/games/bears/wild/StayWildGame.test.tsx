import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import StayWildGame from './StayWildGame';
import { stepWild } from './wildLogic';
import {
  trackBearsGameComplete,
  trackBearsGameStart,
} from '../../../utils/analytics';

vi.mock('../../../utils/analytics', () => ({
  trackBearsGameStart: vi.fn(),
  trackBearsGameComplete: vi.fn(),
  trackBearsTipLinkClick: vi.fn(),
}));

vi.mock('./wildLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./wildLogic')>();
  return { ...actual, stepWild: vi.fn(actual.stepWild) };
});

const renderGame = () =>
  render(
    <MemoryRouter>
      <StayWildGame from="contact" soundOn={false} />
    </MemoryRouter>,
  );

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

const key = (k: string, type: 'keyDown' | 'keyUp' = 'keyDown') =>
  act(() => {
    fireEvent[type](window, { key: k });
  });

const start = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Wake up, Maple' }));

describe('StayWildGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    // jsdom has no canvas; the game skips drawing without a context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    localStorage.clear();
    vi.mocked(trackBearsGameStart).mockClear();
    vi.mocked(trackBearsGameComplete).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('explains the rules, then starts spring', () => {
    renderGame();

    expect(
      screen.getByRole('heading', { name: 'Help Maple get ready for winter' }),
    ).toBeInTheDocument();
    start();

    expect(trackBearsGameStart).toHaveBeenCalledWith('wild', 'contact');
    expect(screen.getByText('Spring · Level 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Winter fat' })).toHaveAttribute(
      'aria-valuenow',
      '15',
    );
  });

  test('arrow keys move Maple to food, and eating is announced', () => {
    renderGame();
    start();

    key('ArrowRight');
    advance(2_000);
    key('ArrowRight', 'keyUp');

    expect(
      Number(
        screen
          .getByRole('meter', { name: 'Winter fat' })
          .getAttribute('aria-valuenow'),
      ),
    ).toBeGreaterThan(15);
    expect(screen.getByRole('status')).toHaveTextContent(
      /Maple ate wetland greens/,
    );
  });

  test('eating shows a +% pill with the food and flashes the fat bar', () => {
    renderGame();
    start();

    key('ArrowRight');
    advance(1_400);
    key('ArrowRight', 'keyUp');

    expect(screen.getByText('+1.5% wetland greens')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Winter fat' })).toHaveClass(
      'wild-hud__bar--flash',
    );

    advance(1_500);
    expect(screen.queryByText('+1.5% wetland greens')).not.toBeInTheDocument();
  });

  test('S sniffs and Escape pauses and resumes', () => {
    renderGame();
    start();

    key('s');
    advance(100);
    expect(screen.getByRole('status')).toHaveTextContent(/Sniff!/);

    key('Escape');
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Quit to Don’t Feed the Bears' }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=contact');
    key('Escape');
    expect(
      screen.queryByRole('heading', { name: 'Paused' }),
    ).not.toBeInTheDocument();
  });

  test('the stage is a labelled group described by the controls', () => {
    renderGame();

    expect(
      screen.getByRole('group', { name: 'Stay Wild' }),
    ).toHaveAccessibleDescription(
      'Left and right arrows to move, Space to jump, S to sniff, Escape to pause.',
    );
  });

  describe('touch controls', () => {
    beforeEach(() => {
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) =>
          ({
            matches: query === '(pointer: coarse)',
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
    });

    const jumps = () =>
      vi.mocked(stepWild).mock.calls.filter(([, input]) => input.jump).length;

    test('Jump works from the keyboard', () => {
      renderGame();
      start();
      vi.mocked(stepWild).mockClear();

      // Enter and Space on a button dispatch a click with no pointer down.
      fireEvent.click(screen.getByRole('button', { name: 'Jump' }));
      advance(100);

      expect(jumps()).toBe(1);
    });

    test('a tap on Jump jumps once, not again on the click that follows', () => {
      renderGame();
      start();
      vi.mocked(stepWild).mockClear();
      const jump = screen.getByRole('button', { name: 'Jump' });

      fireEvent.pointerDown(jump);
      advance(50);
      fireEvent.click(jump);
      advance(100);

      expect(jumps()).toBe(1);
    });

    test('Sniff works from the keyboard', () => {
      renderGame();
      start();

      fireEvent.click(document.querySelector('.wild-touch__sniff')!);
      advance(100);

      expect(screen.getByRole('status')).toHaveTextContent(/Sniff!/);
    });
  });

  test('a run always ends with the end card and is reported', () => {
    renderGame();
    start();

    key('ArrowRight');
    for (let i = 0; i < 400 && !screen.queryByRole('region'); i++) {
      key(' ');
      advance(350);
      key(' ', 'keyUp');
    }

    const card = screen.getByRole('region');
    expect(
      within(card).getByRole('link', { name: 'Now play as the camper' }),
    ).toHaveAttribute('href', '/dont-feed-the-bears/camp?from=contact');
    expect(within(card).getByText('Winter fat')).toBeInTheDocument();
    expect(trackBearsGameComplete).toHaveBeenCalledWith(
      'wild',
      'contact',
      expect.any(Number),
    );
    expect(within(card).getByRole('heading', { level: 2 })).toHaveFocus();
  });
});
