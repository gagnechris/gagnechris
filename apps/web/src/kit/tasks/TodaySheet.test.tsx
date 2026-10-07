import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '@gagnechris/shared';
import { TodaySheet } from './TodaySheet';

const row = (id: string, title: string) => ({
  task: { id, title, status: 'todo', priority: 'med' } as Pick<
    Task,
    'id' | 'title' | 'status' | 'priority'
  >,
  source: { kind: 'note', label: 'Thu note · 1 day' } as never,
});

function renderSheet(
  overrides: Partial<Parameters<typeof TodaySheet>[0]> = {},
) {
  const props = {
    stillOpen: [row('a', 'Reply to recruiter'), row('b', 'Renew card')],
    comingUp: [
      {
        date: '2026-10-05',
        tasks: [
          { id: 'c', title: 'Brand fonts', status: 'todo', priority: 'med' },
        ],
      },
    ] as never,
    day: '2026-10-02',
    snoozeFrom: '2026-10-02',
    onClose: vi.fn(),
    onToggle: vi.fn(),
    onSnooze: vi.fn(),
    onDrop: vi.fn(),
    onAddToNote: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <TodaySheet {...props} />
    </MemoryRouter>,
  );
  return {
    props,
    sheet: screen.getByRole('dialog', { name: 'Today’s tasks' }),
  };
}

describe('TodaySheet', () => {
  test('keeps Tab inside the sheet and closes on Escape', async () => {
    const user = userEvent.setup();
    const { props, sheet } = renderSheet();
    const first = within(sheet).getByRole('tab', { name: 'Still open · 2' });
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(
      within(sheet).getByRole('button', {
        name: 'More actions for Renew card',
      }),
    ).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test('the tabs are one tab stop: arrows, Home and End switch the linked panel', async () => {
    const user = userEvent.setup();
    const { sheet } = renderSheet();
    const open = within(sheet).getByRole('tab', { name: /^Still open/ });
    const coming = within(sheet).getByRole('tab', { name: /^Coming up/ });
    expect([open.tabIndex, coming.tabIndex]).toEqual([0, -1]);
    const panel = () => within(sheet).getByRole('tabpanel');
    expect(open).toHaveAttribute('aria-controls', panel().id);

    await user.keyboard('{End}');
    expect(coming).toHaveFocus();
    expect(coming).toHaveAttribute('aria-selected', 'true');
    expect(coming).toHaveAttribute('aria-controls', panel().id);
    expect(panel()).toHaveAttribute('aria-labelledby', coming.id);
    await user.keyboard('{Home}');
    expect(open).toHaveFocus();
    expect(open).toHaveAttribute('aria-selected', 'true');
  });

  test('closing returns focus to what opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    renderSheet();
    expect(opener).not.toHaveFocus();
    cleanup();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  test('⋯ and a left swipe both reveal Snooze and Drop', async () => {
    const user = userEvent.setup();
    const { props, sheet } = renderSheet();
    await user.click(
      within(sheet).getByRole('button', {
        name: 'More actions for Reply to recruiter',
      }),
    );
    const snooze = within(sheet).getByRole('button', {
      name: 'Snooze Reply to recruiter to Mon, Oct 5',
    });
    expect(snooze).toHaveFocus();
    await user.click(snooze);
    expect(props.onSnooze).toHaveBeenCalledWith('a', {
      startDate: '2026-10-05',
      someday: false,
    });

    const card = within(sheet).getByText('Renew card').closest('li')!;
    const main = card.querySelector('.today-sheet__row-main')!;
    fireEvent.pointerDown(main, { clientX: 300, clientY: 20 });
    fireEvent.pointerUp(main, { clientX: 200, clientY: 24 });
    await user.click(
      within(card).getByRole('button', { name: 'Drop Renew card' }),
    );
    expect(props.onDrop).toHaveBeenCalledWith('b');
  });

  test('a downward drag on the handle, the scrim and Close all close it', () => {
    const { props, sheet } = renderSheet();
    const grab = sheet.querySelector('.today-sheet__grab')!;
    fireEvent.pointerDown(grab, { clientY: 100 });
    fireEvent.pointerMove(grab, { clientY: 220 });
    fireEvent.pointerUp(grab, { clientY: 220 });
    fireEvent.click(document.querySelector('.today-sheet__scrim')!);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  test('Coming up rows show their day and add to the note', async () => {
    const user = userEvent.setup();
    const { props, sheet } = renderSheet();
    await user.click(within(sheet).getByRole('tab', { name: 'Coming up · 1' }));
    expect(within(sheet).getByText('Mon, Oct 5')).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole('button', {
        name: 'Add Brand fonts to today’s note',
      }),
    );
    expect(props.onAddToNote).toHaveBeenCalledWith('c');
  });

  test('read-only rows have no checkbox, actions or + Note', () => {
    const { sheet } = renderSheet({ readOnly: true, onAddToNote: undefined });
    expect(within(sheet).queryByRole('checkbox')).toBeNull();
    expect(
      within(sheet).queryByRole('button', { name: /More actions/ }),
    ).toBeNull();
    expect(
      within(sheet).queryByRole('button', { name: /today’s note/ }),
    ).toBeNull();
  });

  test('Coming up copy follows the horizon', async () => {
    const user = userEvent.setup();
    const { sheet } = renderSheet({ horizonDays: 7, onAddToNote: undefined });
    await user.click(within(sheet).getByRole('tab', { name: /^Coming up/ }));
    expect(
      within(sheet).getByText('Starting in the next week.'),
    ).toBeInTheDocument();
  });

  test('says two weeks at the default horizon', async () => {
    const user = userEvent.setup();
    const { sheet } = renderSheet({ comingUp: [], onAddToNote: undefined });
    await user.click(within(sheet).getByRole('tab', { name: /^Coming up/ }));
    expect(
      within(sheet).getByText('Starting in the next two weeks.'),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText('Nothing in the next two weeks.'),
    ).toBeInTheDocument();
  });
});
