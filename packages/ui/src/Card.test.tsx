import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Card } from './Card.js';

describe('Card', () => {
  test('a plain card is a box, not a control', () => {
    const { container } = render(
      <Card title="Profile" meta="Shown on the homepage" compact variant="flat">
        Body
      </Card>,
    );
    const card = container.firstElementChild!;
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveClass('ui-card', 'ui-card--flat', 'ui-card--compact');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('an interactive card is one link or one focusable button', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <Card href="/projects/a" title="Project A" />
        <Card onClick={onClick} title="Project B" selected />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Project A' })).toHaveClass(
      'ui-card--interactive',
    );
    const button = screen.getByRole('button', { name: 'Project B' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('the editorial card is an article whose title is the link', () => {
    render(
      <Card
        tone="editorial"
        title="Notebook"
        href="/projects/notebook"
        meta="2026 · React, Go"
        preview={<img alt="" src="/p.png" />}
      >
        A daily notebook.
      </Card>,
    );
    const article = screen.getByRole('article');
    expect(article).toHaveClass('ui-card--editorial');
    expect(
      screen.getByRole('heading', { level: 3, name: 'Notebook' }),
    ).toContainElement(screen.getByRole('link', { name: 'Notebook' }));
  });

  test('an editorial entry can be a list item with a kicker, a heading level and a router link', () => {
    const RouterLink = ({
      href,
      className,
      children,
    }: {
      href: string;
      className?: string;
      children: ReactNode;
    }) => (
      <a className={className} href={href} data-router="">
        {children}
      </a>
    );
    render(
      <ul>
        <Card
          tone="editorial"
          as="li"
          data-slug="notebook"
          kicker={<p>Live</p>}
          headingLevel={2}
          title="Notebook"
          href="/projects/notebook"
          linkAs={RouterLink}
        />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveClass('ui-card--editorial');
    expect(item).toHaveAttribute('data-slug', 'notebook');
    expect(
      item.querySelector('.ui-card__body')?.firstElementChild,
    ).toHaveTextContent('Live');
    const link = screen.getByRole('link', { name: 'Notebook' });
    expect(link).toHaveAttribute('data-router');
    expect(screen.getByRole('heading', { level: 2 })).toContainElement(link);
  });
});
