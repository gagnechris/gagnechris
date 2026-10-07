import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  advance,
  renderInRouter,
  setupGameTests,
  stubClipboard,
  stubMedia,
  stubShare,
} from '../shared/test-utils';
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
  renderInRouter(<CampRulesGame from={from} soundOn={false} />);

const start = (label = 'Start the evening') =>
  fireEvent.click(screen.getByRole('button', { name: label }));

const playToEnd = () => {
  renderGame();
  start();
  advance(60_000);
};

describe('CampRulesGame', () => {
  setupGameTests({ now: new Date(2026, 9, 3, 18, 0) });

  beforeEach(() => {
    vi.mocked(trackBearsGameStart).mockClear();
    vi.mocked(trackBearsGameComplete).mockClear();
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

    const card = screen.getByRole('region');
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
    const writeText = stubClipboard();
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

  test('the copy status is announced, then resets', async () => {
    stubClipboard();
    playToEnd();
    const status = within(screen.getByRole('region').parentElement!).getByRole(
      'status',
    );
    expect(status).toBeEmptyDOMElement();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy result' }));
    });
    expect(status).toHaveTextContent('Copied!');

    advance(3_000);
    expect(status).toBeEmptyDOMElement();
    expect(
      screen.getByRole('button', { name: 'Copy result' }),
    ).toBeInTheDocument();
  });

  test('a failed copy is announced too', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    playToEnd();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy result' }));
    });
    expect(
      within(screen.getByRole('region').parentElement!).getByRole('status'),
    ).toHaveTextContent('Couldn’t copy');
  });

  test('the end card is beside the field, not inside it', () => {
    playToEnd();

    const card = screen.getByRole('region');
    const field = document.querySelector('.camp-field')!;
    expect(field).not.toContainElement(card);
    expect(field.parentElement).toContainElement(card);
    expect(document.querySelector('.camp')).toHaveClass('camp--over');
  });

  test('focus moves to the end card heading when the evening ends', () => {
    playToEnd();

    expect(
      within(screen.getByRole('region')).getByRole('heading', { level: 2 }),
    ).toHaveFocus();
  });

  describe('share result', () => {
    const coarsePointer = (coarse: boolean) =>
      stubMedia((query) => coarse && query === '(pointer: coarse)');

    test('opens the share sheet with the one-line summary on touch screens', async () => {
      coarsePointer(true);
      const share = vi.fn().mockResolvedValue(undefined);
      stubShare(share);
      const writeText = stubClipboard();
      playToEnd();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
      });

      expect(share).toHaveBeenCalledWith({
        title: 'Camp Rules',
        text: expect.stringMatching(
          /^Camp Rules · Oct 3 · held \d+s, \d+ saves?$/,
        ),
        url: 'https://gagnechris.com/dont-feed-the-bears/camp',
      });
      expect(writeText).not.toHaveBeenCalled();
    });

    test('closing the share sheet does not copy', async () => {
      coarsePointer(true);
      stubShare(
        vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError')),
      );
      const writeText = stubClipboard();
      playToEnd();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
      });

      expect(writeText).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Share result' }),
      ).toBeInTheDocument();
    });

    test('copies the result when sharing fails', async () => {
      coarsePointer(true);
      stubShare(
        vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')),
      );
      const writeText = stubClipboard();
      playToEnd();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
      });

      expect(writeText).toHaveBeenCalledWith(
        expect.stringMatching(/^Camp Rules 2026-10-03: /),
      );
      expect(
        screen.getByRole('button', { name: 'Copied!' }),
      ).toBeInTheDocument();
    });

    test('follows a change of pointer after the evening ends', () => {
      let coarse = false;
      const media = stubMedia((q) => q === '(pointer: coarse)' && coarse);
      stubShare(vi.fn().mockResolvedValue(undefined));
      playToEnd();
      expect(
        screen.getByRole('button', { name: 'Copy result' }),
      ).toBeInTheDocument();

      coarse = true;
      media.change();
      expect(
        screen.getByRole('button', { name: 'Share result' }),
      ).toBeInTheDocument();
    });

    test('desktop copies even when the browser can share', async () => {
      coarsePointer(false);
      const share = vi.fn().mockResolvedValue(undefined);
      stubShare(share);
      const writeText = stubClipboard();
      playToEnd();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy result' }));
      });

      expect(share).not.toHaveBeenCalled();
      expect(writeText).toHaveBeenCalled();
    });

    test('touch screens without Web Share copy the result', async () => {
      coarsePointer(true);
      const writeText = stubClipboard();
      playToEnd();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy result' }));
      });

      expect(writeText).toHaveBeenCalled();
    });
  });

  test('the end card summarizes the evening in one line', () => {
    playToEnd();

    expect(
      screen.getByText(/^\d+s · \d+ saves? · score \d+$/),
    ).toBeInTheDocument();
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
      const text = screen.getByRole('region').textContent;
      unmount();
      return text;
    };
    expect(runOnce()).toEqual(runOnce());
  });
});
