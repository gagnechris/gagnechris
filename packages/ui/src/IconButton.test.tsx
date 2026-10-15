import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { IconButton } from './IconButton.js';

const Icon = () => <svg data-testid="icon" />;

describe('IconButton', () => {
  test('is named by its label, which is also the tooltip', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton label="Search" onClick={onClick}>
        <Icon />
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Search' });
    expect(btn).toHaveAttribute('title', 'Search');
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveClass('ui-icon-btn--ghost', 'ui-icon-btn--md');
    await user.tab();
    expect(btn).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('pressed sets aria-pressed; a count joins the name', () => {
    render(
      <>
        <IconButton label="Bold" pressed>
          <Icon />
        </IconButton>
        <IconButton label="Inbox" count={3}>
          <Icon />
        </IconButton>
        <IconButton label="Empty" count={0}>
          <Icon />
        </IconButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Inbox, 3' })).toHaveTextContent(
      '3',
    );
    expect(screen.getByRole('button', { name: 'Empty' })).toBeInTheDocument();
  });

  test('editorial tone defaults to outline', () => {
    render(
      <IconButton label="Share" tone="editorial">
        <Icon />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Share' })).toHaveClass(
      'ui-icon-btn--outline',
      'ui-icon-btn--editorial',
    );
  });
});
