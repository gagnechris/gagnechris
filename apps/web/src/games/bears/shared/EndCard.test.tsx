import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import EndCard from './EndCard';
import { BEAR_TIPS } from '../tips';

const tip = BEAR_TIPS[0]!;

const renderCard = (props: Partial<Parameters<typeof EndCard>[0]> = {}) => {
  const onPlayAgain = vi.fn();
  const onTipLinkClick = vi.fn();
  render(
    <MemoryRouter>
      <EndCard
        game="camp"
        from="contact"
        outcome="win"
        kicker="Camp made it to dark"
        title="Perfect evening."
        paws={2}
        stats={[
          { label: 'Saves', value: 3 },
          { label: 'Score', value: 675 },
        ]}
        tip={tip}
        onPlayAgain={onPlayAgain}
        onTipLinkClick={onTipLinkClick}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onPlayAgain, onTipLinkClick };
};

describe('EndCard', () => {
  test('is a labelled dialog with the paw rating and stats', () => {
    renderCard();

    expect(
      screen.getByRole('dialog', { name: 'Perfect evening.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '2 of 3 paws' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Saves')).toBeInTheDocument();
    expect(screen.getByText('675')).toBeInTheDocument();
  });

  test('links to the other side, keeping ?from=', () => {
    renderCard();

    expect(
      screen.getByRole('link', { name: 'Now play as the bear' }),
    ).toHaveAttribute('href', '/dont-feed-the-bears/wild?from=contact');
  });

  test('links back to the landing page, keeping ?from=', () => {
    renderCard();

    expect(
      screen.getByRole('link', { name: 'Back to Don’t Feed the Bears' }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=contact');
  });

  test('the bear side links back to the camper', () => {
    renderCard({ game: 'wild', from: 'direct' });

    expect(
      screen.getByRole('link', { name: 'Now play as the camper' }),
    ).toHaveAttribute('href', '/dont-feed-the-bears/camp');
  });

  test('shows the tip with its source and reports clicks', () => {
    const { onPlayAgain, onTipLinkClick } = renderCard();

    const source = screen.getByRole('link', {
      name: 'Vermont Fish & Wildlife source',
    });
    expect(source).toHaveAttribute('href', tip.sourceUrl);
    fireEvent.click(source);
    expect(onTipLinkClick).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(onPlayAgain).toHaveBeenCalled();
  });

  test('hides the rating when paws is omitted', () => {
    renderCard({ paws: undefined });

    expect(screen.queryByRole('img', { name: /paws/ })).not.toBeInTheDocument();
  });
});
