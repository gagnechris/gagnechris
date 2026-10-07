import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { stubMedia } from '../../games/bears/shared/test-utils';
import CampRules from './CampRules';
import StayWild from './StayWild';
import { trackBearsGameStart } from '../../utils/analytics';

vi.mock('../../utils/analytics', () => ({
  trackBearsGameStart: vi.fn(),
  trackBearsGameComplete: vi.fn(),
  trackBearsTipLinkClick: vi.fn(),
}));

const renderAt = (url: string, page: React.ReactNode) =>
  render(<MemoryRouter initialEntries={[url]}>{page}</MemoryRouter>);

describe('Camp Rules page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('starts the camp game with the entry point', () => {
    renderAt('/dont-feed-the-bears/camp?from=404', <CampRules />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Camp Rules' }),
    ).toBeInTheDocument();
    expect(trackBearsGameStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start the evening' }));
    expect(trackBearsGameStart).toHaveBeenCalledWith('camp', '404');
  });

  test('links back to the landing page and its tips, keeping ?from=', () => {
    renderAt('/dont-feed-the-bears/camp?from=404', <CampRules />);

    expect(
      screen.getByRole('link', { name: 'Don’t Feed the Bears' }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=404');
    expect(
      screen.getByRole('link', { name: 'Skip to the bear tips' }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=404#tips');
  });

  test('on a phone, labels today’s camp beside the title, or a random one', () => {
    stubMedia((query) => query === '(max-width: 480px)');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 18, 0));
    try {
      renderAt('/dont-feed-the-bears/camp', <CampRules />);

      expect(screen.getByText('Daily camp · Oct 4')).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Or play a random camp' }),
      );
      expect(screen.getByText('Random camp')).toBeInTheDocument();
      expect(screen.queryByText('Daily camp · Oct 4')).not.toBeInTheDocument();
      // The header and the game read the same mode.
      expect(
        screen.getByText(/Random camp: a new evening every time/),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('wider than a phone, the camp is named only below the field', () => {
    stubMedia(() => false);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 18, 0));
    try {
      renderAt('/dont-feed-the-bears/camp', <CampRules />);

      expect(screen.queryByText('Daily camp · Oct 4')).not.toBeInTheDocument();
      expect(
        screen.getByText(/Daily camp for 2026-10-04: everyone gets/),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('sound starts off', () => {
    renderAt('/dont-feed-the-bears/camp', <CampRules />);

    expect(screen.getByRole('button', { name: 'Sound: Off' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('Stay Wild page', () => {
  test('explains the game and starts it with the entry point', () => {
    renderAt('/dont-feed-the-bears/wild?from=footer', <StayWild />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Stay Wild' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Help Maple get ready for winter' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sound: Off' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Wake up, Maple' }));
    expect(trackBearsGameStart).toHaveBeenCalledWith('wild', 'footer');
  });
});
