import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { DragHandle } from './DragHandle.js';

const Harness = ({ onDrop }: { onDrop: () => void }) => {
  const [items, setItems] = useState(['Intro', 'Body', 'Outro']);
  const move = (name: string, by: -1 | 1) =>
    setItems((list) => {
      const at = list.indexOf(name);
      const next = [...list];
      next.splice(at, 1);
      next.splice(at + by, 0, name);
      return next;
    });
  return (
    <ul>
      {items.map((name, i) => (
        <li key={name}>
          <DragHandle
            item={name}
            position={i + 1}
            count={items.length}
            onMove={(by) => move(name, by)}
            onDrop={onDrop}
          />
          <span className="name">{name}</span>
        </li>
      ))}
    </ul>
  );
};

describe('DragHandle', () => {
  test('Space picks up, arrows move with announcements, Space drops', async () => {
    const user = userEvent.setup();
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const handle = screen.getByRole('button', { name: 'Reorder Intro' });
    await user.tab();
    expect(handle).toHaveFocus();
    expect(handle).toHaveAttribute('aria-pressed', 'false');

    await user.keyboard(' ');
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    const status = () =>
      screen
        .getAllByRole('status')
        .map((s) => s.textContent)
        .join(' ');
    expect(status()).toContain('Picked up Intro, position 1 of 3.');

    await user.keyboard('{ArrowUp}');
    expect(status()).not.toContain('Moved');
    await user.keyboard('{ArrowDown}');
    expect(status()).toContain('Moved Intro to position 2 of 3.');
    const names = () =>
      [...document.querySelectorAll('.name')].map((el) => el.textContent);
    expect(names()).toEqual(['Body', 'Intro', 'Outro']);
    expect(screen.getByRole('button', { name: 'Reorder Intro' })).toHaveFocus();

    await user.keyboard(' ');
    expect(status()).toContain('Dropped Intro at position 2 of 3.');
    expect(onDrop).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowDown}');
    expect(names()).toEqual(['Body', 'Intro', 'Outro']);
  });

  test('Escape drops without reaching the container', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && outer()}>
        <DragHandle item="Row" onMove={() => {}} />
      </div>,
    );
    await user.tab();
    await user.keyboard(' ');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Reorder Row' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(outer).not.toHaveBeenCalled();
  });
});
