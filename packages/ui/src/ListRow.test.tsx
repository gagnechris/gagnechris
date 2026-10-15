import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { List, ListRow } from './ListRow.js';

describe('ListRow', () => {
  test('rows are list items whose title links to the item', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(
      <List aria-label="Posts">
        <ListRow
          title="Hello"
          href="/posts/hello"
          meta="Updated today"
          current
          leading={<input type="checkbox" aria-label="Select Hello" />}
          trailing={<span>Draft</span>}
          actions={
            <button type="button" onClick={onArchive}>
              Archive
            </button>
          }
        />
        <ListRow title="Second" onClick={() => {}} />
      </List>,
    );
    const list = screen.getByRole('list', { name: 'Posts' });
    const [first] = within(list).getAllByRole('listitem');
    const link = within(first!).getByRole('link', { name: 'Hello' });
    expect(link).toHaveAttribute('aria-current', 'true');
    expect(first).toHaveClass('ui-row--current');

    await user.tab();
    expect(
      screen.getByRole('checkbox', { name: 'Select Hello' }),
    ).toHaveFocus();
    await user.tab();
    expect(link).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onArchive).toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
  });
});

describe('List', () => {
  test('passes a ref to the list element', () => {
    const ref = createRef<HTMLUListElement>();
    render(<List ref={ref} aria-label="Roles" />);
    expect(ref.current).toBe(screen.getByRole('list', { name: 'Roles' }));
  });
});
