import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { Tabs } from './Tabs.js';

type Key = 'today' | 'upcoming' | 'done';

const Harness = ({ panels = true }: { panels?: boolean }) => {
  const [selected, setSelected] = useState<Key>('today');
  return (
    <Tabs
      label="Task views"
      selected={selected}
      onSelect={setSelected}
      items={[
        {
          key: 'today',
          label: 'Today',
          count: 4,
          panel: panels ? 'Today list' : undefined,
        },
        {
          key: 'upcoming',
          label: 'Upcoming',
          panel: panels ? 'Upcoming list' : undefined,
        },
        { key: 'done', label: 'Done', panel: panels ? 'Done list' : undefined },
      ]}
    />
  );
};

describe('Tabs', () => {
  test('a tablist with one tab stop; arrows, Home and End move and select', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(
      screen.getByRole('tablist', { name: 'Task views' }),
    ).toBeInTheDocument();
    const [today, upcoming, done] = screen.getAllByRole('tab');
    expect(today).toHaveAccessibleName(/^Today\s?4$/);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Today list');
    await user.tab();
    expect(today).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(upcoming).toHaveFocus();
    expect(upcoming).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Upcoming list');
    await user.keyboard('{End}');
    expect(done).toHaveFocus();
    await user.keyboard('{Home}');
    expect(today).toHaveFocus();
  });

  test('without panels the tabs point at nothing', () => {
    render(<Harness panels={false} />);
    expect(screen.getAllByRole('tab')[0]).not.toHaveAttribute('aria-controls');
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  test('end controls sit in the tab row, outside the tablist', () => {
    render(
      <Tabs
        label="Lists"
        selected="a"
        onSelect={() => {}}
        items={[{ key: 'a', label: 'A', panel: 'A list' }]}
        end={<button type="button">Close</button>}
      />,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(screen.getByRole('tablist')).not.toContainElement(close);
    expect(close.parentElement).toHaveClass('ui-tabs__bar');
  });
});
