import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { DragHandle } from './DragHandle.js';
import { useDragReorder } from './useDragReorder.js';

const ROW = 40;

const Harness = ({ onDrop }: { onDrop: () => void }) => {
  const [items, setItems] = useState(['a', 'b', 'c']);
  const list = useRef<HTMLUListElement>(null);
  const drag = useDragReorder({
    ids: items,
    list,
    onMove: (from, to) =>
      setItems((rows) => {
        const next = [...rows];
        next.splice(to, 0, ...next.splice(from, 1));
        return next;
      }),
    onDrop,
  });
  return (
    <ul ref={list}>
      {items.map((id, i) => (
        <li
          key={id}
          ref={(el) => {
            if (el)
              el.getBoundingClientRect = () =>
                ({ top: i * ROW, bottom: (i + 1) * ROW }) as DOMRect;
          }}
        >
          <DragHandle
            item={id}
            onMove={() => {}}
            onPointerDown={drag.start(id)}
          />
        </li>
      ))}
    </ul>
  );
};

const order = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label')!.replace('Reorder ', ''));

describe('useDragReorder', () => {
  test('moves the dragged row to the row under the pointer, then drops it', () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Reorder a' }));
    fireEvent.pointerMove(window, { clientY: ROW * 2 + 5 });
    expect(order()).toEqual(['b', 'c', 'a']);
    expect(onDrop).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
    expect(onDrop).toHaveBeenCalledOnce();
    fireEvent.pointerMove(window, { clientY: 5 });
    expect(order()).toEqual(['b', 'c', 'a']);
  });
});
