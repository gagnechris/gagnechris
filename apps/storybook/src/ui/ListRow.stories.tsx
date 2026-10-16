import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Checkbox,
  Chip,
  DragHandle,
  IconButton,
  List,
  ListRow,
  StatusBadge,
} from '@gagnechris/ui';
import ShellIcon from '@web/workspace/ui/ShellIcon';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/ListRow',
  component: ListRow,
  parameters: catalog(
    '`apps/mobile/src/ui/ListRow.tsx`',
    'A 52px row in a List: leading control (Checkbox, DragHandle or icon), a title that links to the item, meta, trailing badges and actions. The current item is `--primary-50` with `aria-current`. Trailing IconButtons show on hover and focus on desktop and always on touch screens.',
  ),
  args: {
    title: 'Shipping the component library',
    href: '#',
    meta: 'Updated today',
  },
  decorators: [
    (Story) => (
      <List aria-label="Posts" style={{ maxWidth: '40rem' }}>
        <Story />
      </List>
    ),
  ],
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const actions = (name: string) => (
  <>
    <IconButton size="sm" label={`Open ${name}`}>
      <ShellIcon name="external" />
    </IconButton>
    <IconButton size="sm" variant="danger" label={`Delete ${name}`}>
      <ShellIcon name="close" />
    </IconButton>
  </>
);

export const Default: Story = {};

export const Current: Story = { args: { current: true } };

export const WithEverything: Story = {
  args: {
    leading: <Checkbox label="Select post" hideLabel />,
    trailing: <StatusBadge status="draft" />,
    actions: actions('post'),
  },
};

export const ButtonTitle: Story = {
  args: { href: undefined, onClick: () => {}, title: 'Morning pages' },
};

export const PlainTitle: Story = {
  args: { href: undefined, title: 'Read-only row', meta: undefined },
};

const TaskRows = () => {
  const [done, setDone] = useState<string[]>(['Book flights']);
  return (
    <>
      {['Book flights', 'Pay rent', 'Call the vet'].map((task, i) => (
        <ListRow
          key={task}
          title={task}
          onClick={() => {}}
          current={i === 1}
          meta={i === 2 ? 'Due tomorrow' : undefined}
          leading={
            <Checkbox
              shape="round"
              hideLabel
              label={task}
              checked={done.includes(task)}
              onChange={(e) =>
                setDone(
                  e.target.checked
                    ? [...done, task]
                    : done.filter((t) => t !== task),
                )
              }
            />
          }
          trailing={i === 2 ? <Chip tone="warning">Tomorrow</Chip> : undefined}
          actions={actions(task)}
        />
      ))}
    </>
  );
};

export const Tasks: Story = { render: () => <TaskRows /> };

export const Reorderable: Story = {
  render: () => (
    <>
      {['Intro', 'Experience', 'Skills'].map((name, i) => (
        <ListRow
          key={name}
          title={name}
          href="#"
          leading={
            <DragHandle
              item={name}
              position={i + 1}
              count={3}
              onMove={() => {}}
            />
          }
        />
      ))}
    </>
  ),
};
