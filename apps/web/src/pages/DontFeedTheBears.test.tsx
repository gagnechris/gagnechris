import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import DontFeedTheBears from './DontFeedTheBears';
import { BEAR_TIPS } from '../games/bears/tips';
import { trackBearsGamePick } from '../utils/analytics';

vi.mock('../utils/analytics', () => ({
  trackBearsGamePick: vi.fn(),
  trackBearsTipLinkClick: vi.fn(),
}));

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <DontFeedTheBears />
    </MemoryRouter>,
  );

describe('DontFeedTheBears landing', () => {
  beforeEach(() => {
    vi.mocked(trackBearsGamePick).mockClear();
  });

  test('offers both sides and carries ?from= into each game', () => {
    renderAt('/dont-feed-the-bears?from=resume');

    const cards = within(screen.getByRole('region', { name: 'Pick a side' }));
    expect(cards.getByRole('link', { name: /camp rules/i })).toHaveAttribute(
      'href',
      '/dont-feed-the-bears/camp?from=resume',
    );
    expect(cards.getByRole('link', { name: /stay wild/i })).toHaveAttribute(
      'href',
      '/dont-feed-the-bears/wild?from=resume',
    );
  });

  test('each card carries the shorter phone copy', () => {
    renderAt('/dont-feed-the-bears');

    expect(screen.getByRole('link', { name: /camp rules/i })).toHaveTextContent(
      'Put food away and keep bears out until dark.',
    );
    expect(screen.getByRole('link', { name: /stay wild/i })).toHaveTextContent(
      'Fatten up on berries and reach the den before snow.',
    );
  });

  test('leaves direct visits without a from param', () => {
    renderAt('/dont-feed-the-bears');

    expect(screen.getByRole('link', { name: /camp rules/i })).toHaveAttribute(
      'href',
      '/dont-feed-the-bears/camp',
    );
  });

  test('tracks which side was picked', () => {
    renderAt('/dont-feed-the-bears?from=footer');

    fireEvent.click(screen.getByRole('link', { name: /camp rules/i }));

    expect(trackBearsGamePick).toHaveBeenCalledWith('camp', 'footer');
  });

  test('lists every bear tip with its source under #tips', () => {
    renderAt('/dont-feed-the-bears');

    const tips = screen.getByRole('region', { name: 'Vermont bear tips' });
    expect(tips).toHaveAttribute('id', 'tips');
    for (const tip of BEAR_TIPS) {
      expect(
        within(tips).getByRole('heading', { name: tip.title }),
      ).toBeInTheDocument();
    }
    expect(within(tips).getAllByRole('link', { name: 'Source' })).toHaveLength(
      BEAR_TIPS.length,
    );
  });
});
