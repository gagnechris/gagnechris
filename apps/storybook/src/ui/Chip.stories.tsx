import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, ChipSelect } from '@gagnechris/ui';
import ShellIcon from '@web/workspace/ui/ShellIcon';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Chip',
  component: Chip,
  parameters: catalog(
    '`apps/mobile/src/ui/Chip.tsx` (`Chip` in the same tones plus a dashed `add` tone; `ChipSelect` opens an action sheet)',
    'A 26px pill in four tones, with an optional dot or icon and a remove button labelled "Remove {value}". With `onClick` it is a toggle. ChipSelect is an outline chip that opens a Menu; empty, it reads as an "Add …" action.',
  ),
  args: { children: 'Work' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'selected', 'warning', 'danger'],
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
  alignItems: 'center',
} as const;

export const Neutral: Story = {};

export const Selected: Story = { args: { tone: 'selected' } };

export const Warning: Story = {
  args: { tone: 'warning', children: 'Due today' },
};

export const Danger: Story = { args: { tone: 'danger', children: 'Overdue' } };

export const AllTones: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div style={row}>
        <Chip>Neutral</Chip>
        <Chip tone="selected">Selected</Chip>
        <Chip tone="warning">Warning</Chip>
        <Chip tone="danger">Danger</Chip>
      </div>
      <div style={row}>
        <Chip dot>With dot</Chip>
        <Chip tone="selected" dot>
          Work
        </Chip>
        <Chip icon={<ShellIcon name="today" />}>Today</Chip>
        <Chip tone="warning" icon={<ShellIcon name="upcoming" />}>
          Oct 20
        </Chip>
      </div>
      <div style={row}>
        <Chip onRemove={() => {}}>design</Chip>
        <Chip tone="selected" onRemove={() => {}}>
          react
        </Chip>
        <Chip tone="danger" onRemove={() => {}} removeLabel="overdue filter">
          Overdue
        </Chip>
      </div>
    </div>
  ),
};

const ToggleChips = () => {
  const [on, setOn] = useState<string[]>(['Today']);
  return (
    <div style={row}>
      {['Today', 'Upcoming', 'Someday'].map((name) => {
        const pressed = on.includes(name);
        return (
          <Chip
            key={name}
            tone={pressed ? 'selected' : 'neutral'}
            pressed={pressed}
            onClick={() =>
              setOn(pressed ? on.filter((n) => n !== name) : [...on, name])
            }
          >
            {name}
          </Chip>
        );
      })}
    </div>
  );
};

export const Toggle: Story = { render: () => <ToggleChips /> };

const AreaSelect = ({ initial }: { initial: 'work' | 'home' | null }) => {
  const [value, setValue] = useState(initial);
  return (
    <ChipSelect
      label="Area"
      value={value}
      onChange={setValue}
      icon={<ShellIcon name="areas" />}
      options={[
        { value: 'work', label: 'Work' },
        { value: 'home', label: 'Home' },
      ]}
    />
  );
};

export const ChipSelectEmpty: Story = {
  render: () => (
    <div style={{ minHeight: '8rem' }}>
      <AreaSelect initial={null} />
    </div>
  ),
};

export const ChipSelectChosen: Story = {
  render: () => (
    <div style={{ minHeight: '8rem' }}>
      <AreaSelect initial="work" />
    </div>
  ),
};

export const ChipSelectDisabled: Story = {
  render: () => (
    <ChipSelect
      label="Area"
      value="work"
      onChange={() => {}}
      disabled
      options={[{ value: 'work', label: 'Work' }]}
    />
  ),
};
