import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
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
