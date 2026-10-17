import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { Field, TextInput } from '@gagnechris/ui';
import { Repeater } from './Repeater';
import { newRepeaterId } from './repeaterId';

type Row = { id: string; title: string };

function Harness({ reorderable = false }: { reorderable?: boolean }) {
  const [items, setItems] = useState<Row[]>([
    { id: 'a', title: 'First' },
    { id: 'b', title: 'Second' },
  ]);
  return (
    <Repeater
      legend="Roles"
      items={items}
      onChange={setItems}
      createItem={() => ({ id: newRepeaterId(), title: '' })}
      addLabel="Add role"
      removeLabel="Remove role"
      reorderable={reorderable}
      renderItem={(item, { update }) => (
        <Field label="Title">
          <TextInput
            aria-label={`Title ${item.id}`}
            value={item.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
      )}
    />
  );
}

describe('Repeater', () => {
  test('keeps stable keys so removing the first row preserves the second field', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const second = screen.getByLabelText('Title b');
    await user.clear(second);
    await user.type(second, 'Kept');
    expect(second).toHaveValue('Kept');

    await user.click(screen.getByRole('button', { name: 'Remove role 1' }));
    expect(screen.queryByLabelText('Title a')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title b')).toHaveValue('Kept');
  });

  test('adds a new row with createItem', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getAllByLabelText(/^Title /)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Add role' }));
    expect(screen.getAllByLabelText(/^Title /)).toHaveLength(3);
  });

  test('the drag handle moves a row from the keyboard and keeps its focus', async () => {
    const user = userEvent.setup();
    render(<Harness reorderable />);

    screen.getByRole('button', { name: 'Reorder row 2' }).focus();
    await user.keyboard(' {ArrowUp} ');

    expect(
      screen
        .getAllByLabelText(/^Title /)
        .map((el) => el.getAttribute('aria-label')),
    ).toEqual(['Title b', 'Title a']);
    expect(screen.getByLabelText('Title b')).toHaveValue('Second');
    expect(screen.getByRole('button', { name: 'Reorder row 1' })).toHaveFocus();
  });

  test('without reorderable there is no drag handle', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull();
  });
});
