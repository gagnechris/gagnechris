import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  test('renders draft status', () => {
    render(<StatusBadge status="draft" />);
    expect(screen.getByText('draft')).toHaveClass('kit-badge--draft');
    expect(screen.queryByText('Unpublished changes')).not.toBeInTheDocument();
  });

  test('renders unpublished-changes badge when flagged', () => {
    render(<StatusBadge status="published" hasUnpublishedChanges />);
    expect(screen.getByText('published')).toHaveClass('kit-badge--published');
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument();
  });
});
