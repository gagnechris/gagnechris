import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Tabs } from '@gagnechris/ui';
import { catalog } from '../catalog';

type View = 'today' | 'upcoming' | 'done';

const items: { key: View; label: string; count?: number; panel: ReactNode }[] =
  [
    {
      key: 'today',
      label: 'Today',
      count: 4,
      panel: <p>Four tasks due today.</p>,
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      count: 12,
      panel: <p>Twelve tasks this week.</p>,
    },
    { key: 'done', label: 'Done', panel: <p>Finished tasks.</p> },
  ];

const meta = {
  title: 'Shared UI/Tabs',
  component: Tabs,
  parameters: catalog(
    '`apps/mobile/src/ui/Tabs.tsx` (drawn as segments)',
    'For switching views of one thing; filters stay SegmentedRadio. `role="tablist"` with one tab stop; arrows move, Home and End jump. Optional count pill. Panels render when the items carry them.',
  ),
  args: { label: 'Task views', items, selected: 'today', onSelect: fn() },
} satisfies Meta<typeof Tabs<View>>;

export default meta;
type Story = StoryObj<typeof meta>;

const TaskViews = ({ panels }: { panels: boolean }) => {
  const [selected, setSelected] = useState<View>('today');
  return (
    <Tabs
      label="Task views"
      selected={selected}
      onSelect={setSelected}
      items={
        panels
          ? items
          : items.map(({ key, label, count }) => ({ key, label, count }))
      }
    />
  );
};

export const WithPanels: Story = { render: () => <TaskViews panels /> };

export const TabsOnly: Story = { render: () => <TaskViews panels={false} /> };
