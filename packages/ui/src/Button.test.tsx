import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Button } from './Button.js';

describe('Button', () => {
  test('renders a button and fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Publish
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Publish' });
    expect(btn).toHaveClass('ui-btn', 'ui-btn--primary');
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('renders a link when href is set and forwards rest props', () => {
    render(
      <Button href="/blog/hello" target="_blank" rel="noreferrer">
        View live
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'View live' });
    expect(link).toHaveAttribute('href', '/blog/hello');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  test('does not force target=_blank when omitted', () => {
    render(<Button href="/blog/hello">View live</Button>);
    const link = screen.getByRole('link', { name: 'View live' });
    expect(link).not.toHaveAttribute('target');
  });

  test('sizes, ghost, link and editorial tone map to classes', () => {
    render(
      <>
        <Button size="sm" variant="ghost">
          Small
        </Button>
        <Button size="lg" variant="link">
          Large
        </Button>
        <Button tone="editorial" variant="primary">
          Send
        </Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass(
      'ui-btn--sm',
      'ui-btn--ghost',
    );
    expect(screen.getByRole('button', { name: 'Large' })).toHaveClass(
      'ui-btn--lg',
      'ui-btn--link',
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass(
      'ui-btn--editorial',
      'ui-btn--primary',
    );
  });

  test('loading keeps the button focusable, sets aria-busy and swallows clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Saving' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeEnabled();
    await user.tab();
    expect(btn).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('Enter and Space activate it from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test('forwards a ref to the button', () => {
    let el: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(node) => {
          el = node;
        }}
      >
        Save
      </Button>,
    );
    expect(el).toBe(screen.getByRole('button', { name: 'Save' }));
  });
});
