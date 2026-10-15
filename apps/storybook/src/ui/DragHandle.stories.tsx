import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { DragHandle, List, ListRow } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/DragHandle',
  component: DragHandle,
  parameters: catalog(
    '`apps/mobile/src/ui/DragGrip.tsx`',
    'A six-dot grip labelled "Reorder {item}". Space picks up, arrows move, Space or Escape drops, and each move is announced. Pointer dragging stays with the caller.',
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
  const move = (name: string, by: -1 | 1) =>
    setItems((list) => {
      const at = list.indexOf(name);
      const next = [...list];
      next.splice(at, 1);
      next.splice(at + by, 0, name);
      return next;
    });
  return (
    <List aria-label="Resume sections" style={{ maxWidth: '28rem' }}>
      {items.map((name, i) => (
        <ListRow
          key={name}
          title={name}
          leading={
            <DragHandle
              item={name}
              position={i + 1}
              count={items.length}
              onMove={(by) => move(name, by)}
            />
          }
        />
      ))}
    </List>
  );
};

export const KeyboardReorder: Story = { render: () => <Sections /> };
