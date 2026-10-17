import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { DragHandle, List, ListRow, useDragReorder } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/DragHandle',
  component: DragHandle,
  parameters: catalog(
    '`apps/mobile/src/ui/DragHandle.tsx` (a drag gesture; VoiceOver moves rows from the row menu)',
    'A six-dot grip labelled "Reorder {item}". Space picks up, arrows move, Space or Escape drops, and each move is announced. `useDragReorder` adds pointer dragging over the list.',
  ),
  args: { item: 'Experience', onMove: fn() },
} satisfies Meta<typeof DragHandle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const Sections = () => {
  const [items, setItems] = useState([
    'Summary',
    'Experience',
    'Skills',
    'Education',
  ]);
  const move = (from: number, to: number) =>
    setItems((list) => {
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  const list = useRef<HTMLUListElement>(null);
  const drag = useDragReorder({ ids: items, list, onMove: move });
  return (
    <List ref={list} aria-label="Resume sections" style={{ maxWidth: '28rem' }}>
      {items.map((name, i) => (
        <ListRow
          key={name}
          title={name}
          leading={
            <DragHandle
              item={name}
              position={i + 1}
              count={items.length}
              onMove={(by) => move(i, i + by)}
              onPointerDown={drag.start(name)}
            />
          }
        />
      ))}
    </List>
  );
};

export const Reorder: Story = { render: () => <Sections /> };
