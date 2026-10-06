import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import NotebookDemo, { NOTEBOOK_DEMO_PHONE_QUERY } from '.';
import {
  NOTEBOOK_DEMO_TOKENS,
  notebookDemoHintText,
  notebookDemoReducer,
  notebookDemoView,
  seedNotebookDemo,
  type NotebookDemoAction,
  type NotebookDemoState,
} from './notebookDemoState';

/** Friday, October 2, 2026, 9:00 on the visitor's clock. */
const FRIDAY = new Date(2026, 9, 2, 9, 0);
const MONDAY = new Date(2026, 9, 5, 23, 30);

const run = (state: NotebookDemoState, ...actions: NotebookDemoAction[]) =>
  actions.reduce(notebookDemoReducer, state);

const typeAndAdd = (
  state: NotebookDemoState,
  value: string,
): NotebookDemoState => run(state, { type: 'type', value }, { type: 'add' });

const hint = (state: NotebookDemoState) =>
  notebookDemoHintText(state.hint, state.today);

const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title);

describe('notebookDemoReducer', () => {
  test('seeds from the injected clock: the note, two carried tasks from earlier notes, one task tomorrow', () => {
    const state = seedNotebookDemo(FRIDAY);
    expect(state.today).toBe('2026-10-02');
    expect(seedNotebookDemo(FRIDAY)).toEqual(state);

    const view = notebookDemoView(state);
    expect(titles(view.noteTasks)).toEqual([
      'Review publisher retry PR',
      'Draft sidebar nav spec',
    ]);
    expect(view.noteTasks.map((t) => t.status)).toEqual(['done', 'todo']);
    expect(view.noteTasks[1]!.priority).toBe('high');
    expect(
      view.stillOpen.map(({ task, source }) => [task.title, source.label]),
    ).toEqual([
      ['Send invoice follow-up', 'Wed note · 2 days'],
      ['Reply to recruiter email', 'Thu note · 1 day'],
    ]);
    expect(view.comingUp).toEqual([
      {
        date: '2026-10-03',
        tasks: [expect.objectContaining({ title: 'Write weekly notes' })],
      },
    ]);
    expect(hint(state)).toBe(NOTEBOOK_DEMO_TOKENS);
  });

  test('Call Sam @mon !high goes into the note, not Coming up, as on the app’s Today; high priority, with the hint saying so', () => {
    const state = typeAndAdd(seedNotebookDemo(FRIDAY), 'Call Sam @mon !high');
    const view = notebookDemoView(state);
    const sam = view.noteTasks.slice(-1)[0]!;
    expect(sam).toMatchObject({
      title: 'Call Sam',
      startDate: '2026-10-05',
      priority: 'high',
      status: 'todo',
    });
    expect(view.comingUp.map((d) => [d.date, titles(d.tasks)])).toEqual([
      ['2026-10-03', ['Write weekly notes']],
    ]);
    expect(view.comingUpCount).toBe(1);
    expect(titles(view.stillOpen.map((r) => r.task))).not.toContain('Call Sam');
    expect(state.draft).toBe('');
    expect(hint(state)).toBe(
      'Scheduled for Mon. It stays in this note, and from that day it shows under Still open on Today.',
    );
  });

  test('hints for undated, tomorrow, someday, far-off and title-less input', () => {
    const friday = seedNotebookDemo(FRIDAY);
    expect(hint(typeAndAdd(friday, 'Buy milk'))).toBe(
      'Added to today’s note. If it isn’t done, it carries forward to tomorrow.',
    );
    expect(hint(typeAndAdd(friday, 'Pack @tomorrow'))).toBe(
      'Scheduled for tomorrow. It stays in this note, and from that day it shows under Still open on Today.',
    );
    const someday = typeAndAdd(friday, 'Learn Rust @someday');
    expect(hint(someday)).toBe(
      'Parked for someday. It stays in this note, off Today and Coming up.',
    );
    expect(notebookDemoView(someday).comingUpCount).toBe(1);
    expect(hint(typeAndAdd(friday, 'Renew passport @dec 1'))).toBe(
      'Scheduled for Dec 1. It stays in this note, and from that day it shows under Still open on Today.',
    );

    const untitled = typeAndAdd(friday, '@mon !high');
    expect(untitled.tasks).toHaveLength(friday.tasks.length);
    expect(untitled.draft).toBe('@mon !high');
    expect(hint(untitled)).toBe(
      'Add a title before the tokens, like Call Sam @mon.',
    );
    expect(run(friday, { type: 'add' })).toBe(friday);
  });

  test('@mon on a Monday is the next Monday, a week out', () => {
    const state = typeAndAdd(seedNotebookDemo(MONDAY), 'Call Sam @mon');
    expect(state.today).toBe('2026-10-05');
    expect(state.tasks.slice(-1)[0]!.startDate).toBe('2026-10-12');
    expect(hint(state)).toBe(
      'Scheduled for Oct 12. It stays in this note, and from that day it shows under Still open on Today.',
    );
  });

  test('+ Note moves a carried task into the note and off Still open; checkboxes toggle it everywhere', () => {
    let state = run(seedNotebookDemo(FRIDAY), {
      type: 'add-to-note',
      id: 'demo-recruiter',
    });
    let view = notebookDemoView(state);
    expect(titles(view.noteTasks).slice(-1)[0]).toBe(
      'Reply to recruiter email',
    );
    expect(titles(view.stillOpen.map((r) => r.task))).toEqual([
      'Send invoice follow-up',
    ]);
    expect(hint(state)).toBe(
      'Pulled into today’s note, so it’s off Still open. It’s the same task as in the Thu note.',
    );
    expect(run(state, { type: 'add-to-note', id: 'demo-recruiter' })).toBe(
      state,
    );

    state = run(state, { type: 'toggle', id: 'demo-recruiter' });
    view = notebookDemoView(state);
    expect(view.noteTasks.slice(-1)[0]!.status).toBe('done');
    expect(hint(state)).toMatch(/^Done\./);

    state = run(state, { type: 'toggle', id: 'demo-weekly' });
    expect(notebookDemoView(state).comingUp).toEqual([]);
    state = run(state, { type: 'toggle', id: 'demo-weekly' });
    expect(notebookDemoView(state).comingUpCount).toBe(1);
    expect(hint(state)).toMatch(/^Reopened\./);
  });
});

const renderDemo = () =>
  render(
    <MemoryRouter>
      <NotebookDemo />
    </MemoryRouter>,
  );

const setPhone = (phone: boolean) =>
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: phone && query === NOTEBOOK_DEMO_PHONE_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );

describe('NotebookDemo', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FRIDAY);
    vi.stubGlobal('fetch', fetchSpy);
    setPhone(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchSpy.mockReset();
  });

  test('keyboard only: type a task and Enter, Tab to + Note and press it, Space toggles; no requests', async () => {
    const user = userEvent.setup();
    renderDemo();
    expect(
      screen.getByRole('heading', { name: 'Friday, October 2' }),
    ).toBeVisible();
    const note = screen.getByRole('region', { name: 'Today’s note' });
    const stillOpen = screen.getByTestId('still-open');
    const comingUp = screen.getByTestId('coming-up');

    const reset = screen.getByRole('button', { name: /^Reset demo/ });
    reset.focus();
    await user.tab();
    expect(
      within(note).getByRole('checkbox', {
        name: 'Reopen Review publisher retry PR',
      }),
    ).toHaveFocus();
    await user.tab();
    const sidebar = within(note).getByRole('checkbox', {
      name: 'Complete Draft sidebar nav spec',
    });
    expect(sidebar).toHaveFocus();
    expect(within(note).getByText('High')).toBeVisible();
    await user.keyboard(' ');
    expect(sidebar).toBeChecked();

    await user.tab();
    const input = screen.getByRole('combobox', { name: 'New task' });
    expect(input).toHaveFocus();
    await user.keyboard('Call Sam @mon !high{Enter}');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    const sam = within(note).getByRole('checkbox', {
      name: 'Complete Call Sam',
    });
    const samRow = sam.closest('.task-embed') as HTMLElement;
    expect(within(samRow).getByText('@Mon')).toBeVisible();
    expect(within(samRow).getByText('High')).toBeVisible();
    expect(
      within(comingUp).queryByRole('checkbox', { name: 'Complete Call Sam' }),
    ).toBeNull();
    expect(
      screen.getByText(
        'Scheduled for Mon. It stays in this note, and from that day it shows under Still open on Today.',
      ),
    ).toBeVisible();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
    await user.tab();
    expect(
      within(stillOpen).getByRole('button', {
        name: 'Add Send invoice follow-up to the note',
      }),
    ).toHaveFocus();
    await user.tab();
    const plusNote = within(stillOpen).getByRole('button', {
      name: 'Add Reply to recruiter email to the note',
    });
    expect(plusNote).toHaveTextContent('+ Note');
    expect(plusNote).toHaveFocus();
    await user.keyboard(' ');
    const recruiter = within(note).getByRole('checkbox', {
      name: 'Complete Reply to recruiter email',
    });
    expect(recruiter).toHaveFocus();
    expect(
      within(stillOpen).queryByText('Reply to recruiter email'),
    ).toBeNull();
    await user.keyboard(' ');
    expect(
      within(note).getByRole('checkbox', {
        name: 'Reopen Reply to recruiter email',
      }),
    ).toBeChecked();

    await user.click(
      within(comingUp).getByRole('checkbox', {
        name: 'Complete Write weekly notes',
      }),
    );
    expect(within(comingUp).queryByText('Write weekly notes')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Reset demo/ }));
    expect(screen.getByRole('button', { name: /^Reset demo/ })).toHaveFocus();
    expect(screen.queryByText('Call Sam')).toBeNull();
    expect(screen.getByText(NOTEBOOK_DEMO_TOKENS)).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('after + Note, a quick-add keeps focus in the input', async () => {
    const user = userEvent.setup();
    renderDemo();
    const note = screen.getByRole('region', { name: 'Today’s note' });
    await user.click(
      within(screen.getByTestId('still-open')).getByRole('button', {
        name: 'Add Reply to recruiter email to the note',
      }),
    );
    expect(
      within(note).getByRole('checkbox', {
        name: 'Complete Reply to recruiter email',
      }),
    ).toHaveFocus();

    const input = screen.getByRole('combobox', { name: 'New task' });
    await user.click(input);
    await user.keyboard('Call Sam{Enter}');
    expect(
      within(note).getByRole('checkbox', { name: 'Complete Call Sam' }),
    ).toBeVisible();
    expect(input).toHaveFocus();
  });

  test('Coming up rows show a short day and Still open rows their source note, as drawn', () => {
    renderDemo();
    const comingUp = screen.getByTestId('coming-up');
    const weekly = within(comingUp)
      .getByText('Write weekly notes')
      .closest('li')!;
    expect(within(weekly).getByText('Sat')).toBeVisible();
    expect(within(comingUp).queryByRole('link')).toBeNull();
    const stillOpen = screen.getByTestId('still-open');
    expect(within(stillOpen).getByText('from earlier days')).toBeVisible();
    expect(within(stillOpen).getByText('Thu note · 1 day')).toBeVisible();
    expect(within(stillOpen).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  test('on a phone the side panels are tabs under the note with counts; arrow keys switch them', async () => {
    setPhone(true);
    const user = userEvent.setup();
    renderDemo();
    expect(screen.getByRole('combobox', { name: 'New task' })).toHaveAttribute(
      'placeholder',
      'Try: Call Sam @mon !high',
    );
    await user.type(
      screen.getByRole('combobox', { name: 'New task' }),
      'Call Sam @mon{Enter}',
    );

    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Still open · 2',
      'Coming up · 1',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Reply to recruiter email',
    );

    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Write weekly notes');
    expect(panel).not.toHaveTextContent('Call Sam');
  });
});
