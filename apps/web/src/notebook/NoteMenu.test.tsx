import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NoteDetailsToggle, NoteMenu } from './NoteMenu';
import {
  resetTaskDetailsStore,
  setTaskDetailsOpen,
  TASK_DETAILS_OPEN_KEY,
  TASK_PEEK_NOTES_KEY,
} from './taskDetailsStore';

const A = '01JTASKAAAAAAAAAAAAAAAAAAA';
const B = '01JTASKBBBBBBBBBBBBBBBBBBB';
const NOTE = '01JNOTEAAAAAAAAAAAAAAAAAAA';
const body = `{{task:${A}}}\ntext\n{{task:${B}}}`;

beforeEach(() => {
  localStorage.clear();
  resetTaskDetailsStore();
});

describe('NoteDetailsToggle', () => {
  test('expands every task in the note, and collapses them while any is open', async () => {
    const user = userEvent.setup();
    render(<NoteDetailsToggle markdown={body} />);

    await user.click(screen.getByRole('button', { name: 'Expand details' }));
    expect(JSON.parse(localStorage.getItem(TASK_DETAILS_OPEN_KEY)!)).toEqual([
      A,
      B,
    ]);

    await user.click(screen.getByRole('button', { name: 'Collapse details' }));
    expect(JSON.parse(localStorage.getItem(TASK_DETAILS_OPEN_KEY)!)).toEqual(
      [],
    );

    setTaskDetailsOpen([B], true);
    await user.click(
      await screen.findByRole('button', { name: 'Collapse details' }),
    );
    expect(JSON.parse(localStorage.getItem(TASK_DETAILS_OPEN_KEY)!)).toEqual(
      [],
    );
  });

  test('shows nothing in a note without tasks', () => {
    const { container } = render(<NoteDetailsToggle markdown="just text" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('NoteMenu', () => {
  test('holds the peek setting for this note and Delete note', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<NoteMenu noteId={NOTE} onDelete={onDelete} />);
    const trigger = screen.getByRole('button', { name: 'Note options' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(
      screen.getByRole('menuitemradio', { name: 'Title only' }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Title and first line' }),
    );
    expect(JSON.parse(localStorage.getItem(TASK_PEEK_NOTES_KEY)!)).toEqual([
      NOTE,
    ]);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(
      screen.getByRole('menuitemradio', { name: 'Title and first line' }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Delete note' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  test('has no Delete note without onDelete', async () => {
    const user = userEvent.setup();
    render(<NoteMenu noteId={NOTE} />);
    await user.click(screen.getByRole('button', { name: 'Note options' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete note' })).toBeNull();
  });
});
