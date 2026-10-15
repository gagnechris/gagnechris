import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SegmentedRadio } from '@gagnechris/ui';
import { catalog } from '../catalog';

const statusOptions = [
  { value: 'all', label: 'All', count: 12 },
  { value: 'draft', label: 'Drafts', count: 3 },
  { value: 'published', label: 'Published', count: 9 },
] as const;

type Status = (typeof statusOptions)[number]['value'];

const meta = {
  title: 'Shared UI/SegmentedRadio',
  component: SegmentedRadio,
  parameters: catalog(
    '`apps/mobile/src/ui/SegmentedControl.tsx`',
    'A radio group drawn as a segmented control: one tab stop, arrow keys move the selection.',
  ),
  args: {
    label: 'Status',
    options: statusOptions,
    value: 'all',
    onChange: fn(),
  },
} satisfies Meta<typeof SegmentedRadio<Status>>;

export default meta;
type Story = StoryObj<typeof meta>;

const StatusFilter = ({ onChange }: { onChange: (value: Status) => void }) => {
  const [value, setValue] = useState<Status>('all');
  return (
    <SegmentedRadio
      label="Status"
      options={statusOptions}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
};

const AreaSwitch = () => {
  const [value, setValue] = useState<'work' | 'home'>('work');
  return (
    <SegmentedRadio
      label="Area"
      options={[
        { value: 'work', label: 'Work' },
        { value: 'home', label: 'Home' },
      ]}
      value={value}
      onChange={setValue}
    />
  );
};

export const WithCounts: Story = {
  render: (args) => <StatusFilter onChange={args.onChange} />,
};

export const WithoutCounts: Story = {
  render: () => <AreaSwitch />,
};
