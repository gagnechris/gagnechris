import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  test('renders draft status', () => {
    render(<StatusBadge status="draft" />);
    expect(screen.getByText('draft')).toHaveClass('admin-badge--draft');
    expect(screen.queryByText('Unpublished changes')).not.toBeInTheDocument();
  });

  test('renders unpublished-changes badge when flagged', () => {
    render(<StatusBadge status="published" hasUnpublishedChanges />);
    expect(screen.getByText('published')).toHaveClass('admin-badge--published');
    expect(screen.getByText('Unpublished changes')).toBeInTheDocument();
  });
});
