import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CarryFooter } from './TodayPanels';

const footer = (count: number) => {
  const { unmount } = render(
    <CarryFooter count={count} nextDay="2026-10-03" />,
  );
  const text = screen.getByTestId('carry-footer').textContent;
  unmount();
  return text;
};

describe('CarryFooter', () => {
  test('never says 0 open tasks, and is singular for one', () => {
    expect(footer(0)).toBe('→ Nothing carries over to Saturday');
    expect(footer(1)).toBe('→ 1 open task will carry to Saturday if not done');
    expect(footer(3)).toBe('→ 3 open tasks will carry to Saturday if not done');
  });
});
