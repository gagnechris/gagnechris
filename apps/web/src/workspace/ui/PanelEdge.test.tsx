import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { PanelCollapseButton, PanelExpandEdge } from './PanelEdge';

const props = {
  label: 'Tasks',
  noun: 'the task panel',
  controls: 'side',
  side: 'right',
  shortcut: '⌥⌘\\',
  keyShortcuts: 'Alt+Meta+\\',
  onToggle: vi.fn(),
} as const;

describe('PanelEdge', () => {
  test('the expand control keeps its name and shows the count, read as its description', () => {
    const { container } = render(
      <PanelExpandEdge {...props} count={3} countLabel="still open" />,
    );
    const button = screen.getByRole('button', { name: 'Tasks' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAccessibleDescription('3 still open');
    expect(button).toHaveTextContent(/^3/);
    expect(container.firstChild).toHaveClass(
      'workspace-edge-zone',
      'workspace-edge-zone--right',
      'workspace-edge-zone--counted',
    );
  });

  test('no count, no badge', () => {
    const { container } = render(<PanelExpandEdge {...props} count={0} />);
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveTextContent('');
    expect(container.firstChild).not.toHaveClass(
      'workspace-edge-zone--counted',
    );
  });

  test('the chevrons point the way the panel moves', () => {
    const path = () =>
      screen.getByRole('button').querySelector('path')?.getAttribute('d');
    const { rerender } = render(
      <PanelCollapseButton {...props} className="edge" />,
    );
    expect(path()).toBe('m9 6 6 6-6 6');
    rerender(<PanelExpandEdge {...props} />);
    expect(path()).toBe('m15 6-6 6 6 6');
    rerender(<PanelCollapseButton {...props} side="left" className="edge" />);
    expect(path()).toBe('m15 6-6 6 6 6');
    rerender(<PanelExpandEdge {...props} side="left" />);
    expect(path()).toBe('m9 6 6 6-6 6');
  });
});
