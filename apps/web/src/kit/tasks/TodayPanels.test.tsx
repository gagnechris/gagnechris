import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { ComingUpPanel, StillOpenPanel } from './TodayPanels';

const task = {
  id: 't1',
  title: 'Write weekly notes',
  status: 'todo' as const,
  priority: 'med' as const,
};

const comingUp = (headingLevel?: 2 | 3 | 4) =>
  render(
    <MemoryRouter>
      <ComingUpPanel
        days={[{ date: '2026-10-03', tasks: [task] }]}
        day="2026-10-02"
        onToggle={vi.fn()}
        headingLevel={headingLevel}
      />
    </MemoryRouter>,
  );

describe('Today panel headings', () => {
  test('default to h2, with Coming up’s day groups at h3', () => {
    comingUp();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Coming up' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Tomorrow',
    );
  });

  test('take the level of where they sit', () => {
    comingUp(3);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Coming up' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      'Tomorrow',
    );
    render(
      <StillOpenPanel
        compact
        rows={[]}
        onAddToNote={vi.fn()}
        headingLevel={4}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 4, name: 'Still open' }),
    ).toBeInTheDocument();
  });
});
