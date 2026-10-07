import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { useTabs } from './useTabs';

const KEYS = ['one', 'two', 'three'] as const;

function Harness() {
  const [selected, setSelected] = useState<(typeof KEYS)[number]>('one');
  const tabs = useTabs({
    keys: KEYS,
    selected,
    onSelect: setSelected,
    label: 'Numbers',
  });
  return (
    <>
      <div {...tabs.listProps}>
        {KEYS.map((key) => (
          <button key={key} {...tabs.tabProps(key)}>
            {key}
          </button>
        ))}
      </div>
      {KEYS.map((key) => (
        <div key={key} {...tabs.panelProps(key)}>
          Panel {key}
        </div>
      ))}
    </>
  );
}

describe('useTabs', () => {
  test('one tab stop, linked to its panel by id', () => {
    render(<Harness />);
    expect(
      screen.getByRole('tablist', { name: 'Numbers' }),
    ).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Panel one');
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0]!.id);
    expect(screen.getByText('Panel two')).not.toBeVisible();
  });

  test('arrows move and select, wrapping; Home and End jump to the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [one, two, three] = screen.getAllByRole('tab');
    await user.tab();
    expect(one).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(two).toHaveFocus();
    expect(two).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel two');

    await user.keyboard('{End}');
    expect(three).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(one).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(three).toHaveFocus();
    await user.keyboard('{Home}');
    expect(one).toHaveFocus();
    expect(one).toHaveAttribute('aria-selected', 'true');
    expect([one, two, three].map((t) => t!.tabIndex)).toEqual([0, -1, -1]);

    await user.tab();
    expect(screen.getByRole('tabpanel')).not.toContainElement(
      document.activeElement as HTMLElement,
    );
  });
});
