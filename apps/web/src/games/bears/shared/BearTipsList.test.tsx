import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { BEAR_TIPS } from '../tips';
import BearTipsList from './BearTipsList';

describe('BearTipsList', () => {
  test('each source link names its tip and says it opens a new tab', () => {
    render(<BearTipsList onTipLinkClick={() => {}} />);

    const links = screen.getAllByRole('link');
    const names = links.map((link) => link.getAttribute('aria-label') ?? '');
    expect(links).toHaveLength(BEAR_TIPS.length);
    expect(new Set(names).size).toBe(BEAR_TIPS.length);
    for (const [i, link] of links.entries()) {
      expect(link).toHaveAccessibleName(
        `Source: ${BEAR_TIPS[i]!.title} (opens in a new tab)`,
      );
      expect(link).toHaveAttribute('target', '_blank');
    }
  });
});
