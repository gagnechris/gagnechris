import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import NotFound from './NotFound';
import { renderWithProviders } from '../test-utils';

describe('NotFound', () => {
  test('offers a playful bears game entry with from=404', () => {
    renderWithProviders(<NotFound />);

    expect(
      screen.getByRole('link', { name: /don't feed the bears/i }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=404');
  });
});
