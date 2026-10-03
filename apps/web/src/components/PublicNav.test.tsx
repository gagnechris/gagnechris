import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import PublicNav from './PublicNav';
import { renderWithProviders } from '../test-utils';

describe('PublicNav', () => {
  test('renders primary site links', () => {
    renderWithProviders(<PublicNav />);

    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Posts' })).toHaveAttribute(
      'href',
      '/posts',
    );
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute(
      'href',
      '/resume',
    );
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  test('marks the current page', () => {
    renderWithProviders(<PublicNav current="/posts" />);

    expect(screen.getByRole('link', { name: 'Posts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
