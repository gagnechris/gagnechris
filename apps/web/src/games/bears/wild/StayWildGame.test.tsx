import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  advance,
  pressKey as key,
  renderInRouter,
  setupGameTests,
  stubMedia,
} from '../shared/test-utils';
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
  renderInRouter(<StayWildGame from="contact" soundOn={false} />);

const start = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Wake up, Maple' }));

describe('StayWildGame', () => {
  setupGameTests();

  beforeEach(() => {
    // jsdom has no canvas; the game skips drawing without a context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.mocked(trackBearsGameStart).mockClear();
    vi.mocked(trackBearsGameComplete).mockClear();
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

  const fatNow = () =>
    Number(
      screen
        .getByRole('meter', { name: 'Winter fat' })
        .getAttribute('aria-valuenow'),
    );

  test('a key released while paused does not keep Maple running', () => {
    renderGame();
    start();

    key('ArrowRight');
    advance(100);
    key('Escape');
    key('ArrowRight', 'keyUp');
    key('Escape');
    advance(2_000);

    expect(fatNow()).toBe(15);
  });

  test('pausing and resuming drop held keys', () => {
    renderGame();
    start();

    key('ArrowRight');
    advance(100);
    key('Escape');
    key('Escape');
    advance(2_000);

    expect(fatNow()).toBe(15);
  });

  test('leaving the window drops held keys', () => {
    renderGame();
    start();

    key('ArrowRight');
    advance(100);
    act(() => {
      fireEvent.blur(window);
    });
    advance(2_000);

    expect(fatNow()).toBe(15);
  });

  describe('touch devices in portrait', () => {
    const PORTRAIT = '(pointer: coarse) and (orientation: portrait)';
    let portrait = false;
    let media: ReturnType<typeof stubMedia>;

    beforeEach(() => {
      portrait = false;
      media = stubMedia(
        (query) =>
          query === '(pointer: coarse)' || (query === PORTRAIT && portrait),
      );
    });

    const rotate = (toPortrait: boolean) => {
      portrait = toPortrait;
      media.change();
    };

    const resume = () =>
      fireEvent.click(
        within(screen.getByRole('region', { name: 'Paused' })).getByRole(
          'button',
          { name: 'Resume' },
        ),
      );

    test('the game does not start in portrait', () => {
      portrait = true;
      renderGame();
      start();

      expect(trackBearsGameStart).not.toHaveBeenCalled();
      expect(
        screen.getByRole('heading', {
          name: 'Help Maple get ready for winter',
        }),
      ).toBeInTheDocument();
    });

    test('turning to portrait pauses, and resume waits for landscape', () => {
      renderGame();
      start();
      advance(100);

      rotate(true);
      expect(
        screen.getByRole('heading', { name: 'Paused' }),
      ).toBeInTheDocument();
      const fat = fatNow();
      resume();
      expect(
        screen.getByRole('heading', { name: 'Paused' }),
      ).toBeInTheDocument();
      advance(2_000);
      expect(fatNow()).toBe(fat);

      rotate(false);
      resume();
      expect(
        screen.queryByRole('heading', { name: 'Paused' }),
      ).not.toBeInTheDocument();
    });
  });

  test('the stage is a labelled group described by the controls', () => {
    renderGame();

    expect(
      screen.getByRole('group', { name: 'Stay Wild' }),
    ).toHaveAccessibleDescription(
      'Left and right arrows to move, Space to jump, S to sniff, Esc to pause.',
    );
  });

  test('the start screen and the footer give the same keyboard help', () => {
    stubMedia(() => false);
    const { container } = renderGame();
    const help =
      'Left and right arrows to move, Space to jump, S to sniff, Esc to pause.';

    expect(container.querySelector('.wild-start__keys')).toHaveTextContent(
      new RegExp(`^${help}$`),
    );
    expect(container.querySelector('.wild-note')).toHaveTextContent(
      new RegExp(`^${help} Score \\d+\\.$`),
    );
  });

  describe('touch controls', () => {
    beforeEach(() => {
      stubMedia((query) => query === '(pointer: coarse)');
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
