import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { IconButton } from '@gagnechris/ui';
import ShellIcon from '@web/workspace/ui/ShellIcon';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/IconButton',
  component: IconButton,
  parameters: catalog(
    '`apps/mobile/src/ui/IconButton.tsx` (same variants and sizes, `pressed`, `count`)',
    'A square button holding one ShellIcon. `label` is the accessible name and the tooltip. Variants `ghost` (default), `outline` and `danger`; sizes `sm` 28, `md` 36 and `lg` 44; `pressed` makes it a toggle; `count` adds a badge read after the label.',
  ),
  args: {
    label: 'Search',
    children: <ShellIcon name="search" />,
    onClick: fn(),
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['ghost', 'outline', 'danger'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    tone: { control: 'inline-radio', options: ['default', 'editorial'] },
    children: { control: false },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'center',
} as const;

export const Default: Story = {};

export const Outline: Story = { args: { variant: 'outline' } };

export const Danger: Story = {
  args: {
    variant: 'danger',
    label: 'Remove',
    children: <ShellIcon name="close" />,
  },
};

export const WithCount: Story = {
  args: { label: 'Today', count: 4, children: <ShellIcon name="today" /> },
};

export const Disabled: Story = { args: { disabled: true } };

const PinToggle = () => {
  const [pressed, setPressed] = useState(true);
  return (
    <IconButton
      label="Show preview"
      pressed={pressed}
      onClick={() => setPressed(!pressed)}
    >
      <ShellIcon name="globe" />
    </IconButton>
  );
};

export const Pressed: Story = { render: () => <PinToggle /> };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} style={row}>
          <IconButton size={size} label="Search">
            <ShellIcon name="search" />
          </IconButton>
          <IconButton size={size} variant="outline" label="Add">
            <ShellIcon name="plus" />
          </IconButton>
          <IconButton size={size} variant="danger" label="Remove">
            <ShellIcon name="close" />
          </IconButton>
          <IconButton size={size} pressed label="Preview">
            <ShellIcon name="globe" />
          </IconButton>
          <IconButton size={size} count={3} label="Tasks">
            <ShellIcon name="tasks" />
          </IconButton>
          <IconButton size={size} disabled label="Locked">
            <ShellIcon name="lock" />
          </IconButton>
        </div>
      ))}
    </div>
  ),
};

export const Editorial: Story = {
  render: () => (
    <div style={row}>
      <IconButton tone="editorial" label="Share">
        <ShellIcon name="external" />
      </IconButton>
      <IconButton tone="editorial" variant="ghost" label="Dismiss">
        <ShellIcon name="close" />
      </IconButton>
      <IconButton tone="editorial" disabled label="Next">
        <ShellIcon name="plus" />
      </IconButton>
    </div>
  ),
};
