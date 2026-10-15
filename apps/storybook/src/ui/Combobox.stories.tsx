import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Combobox, Field, type ComboboxOption } from '@gagnechris/ui';
import { catalog } from '../catalog';

const NOTES: ComboboxOption[] = [
  { id: '1', label: 'Taxes 2026', meta: 'Oct 2' },
  { id: '2', label: 'Trip to Lisbon', meta: 'Sep 18' },
  { id: '3', label: 'Reading list', meta: 'Aug 30' },
  { id: '4', label: 'Archived ideas', meta: 'Jan 4', disabled: true },
];

const meta = {
  title: 'Shared UI/Combobox',
  component: Combobox,
  parameters: catalog(
    'none',
    'A TextInput with a listbox popup in the Menu surface. Focus stays in the input; arrows move the active option (`aria-activedescendant`), Enter picks, Escape closes. Empty and loading rows use hint text; errors use `--color-error`.',
  ),
  args: {
    'aria-label': 'Linked note',
    value: '',
    onValueChange: fn(),
    options: NOTES,
    onPick: fn(),
  },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

const NotePicker = ({
  loading,
  error,
  onPick,
}: {
  loading?: boolean;
  error?: ReactNode;
  onPick: (option: ComboboxOption) => void;
}) => {
  const [value, setValue] = useState('');
  const matches = NOTES.filter((n) =>
    n.label.toLowerCase().includes(value.toLowerCase()),
  );
  return (
    <div style={{ maxWidth: '22rem', minHeight: '16rem' }}>
      <Field label="Linked note" hint="Type to filter, arrows to choose">
        <Combobox
          placeholder="Find a note"
          value={value}
          onValueChange={setValue}
          options={loading || error ? [] : matches}
          loading={loading}
          error={error}
          onPick={(option) => {
            setValue(option.label);
            onPick(option);
          }}
        />
      </Field>
    </div>
  );
};

export const Default: Story = {
  render: (args) => <NotePicker onPick={args.onPick} />,
};

export const Loading: Story = {
  render: (args) => <NotePicker loading onPick={args.onPick} />,
};

export const WithError: Story = {
  render: (args) => (
    <NotePicker error="Search failed. Try again." onPick={args.onPick} />
  ),
};

export const NoMatches: Story = {
  args: { options: [], value: 'zzz' },
  render: (args) => (
    <div style={{ maxWidth: '22rem', minHeight: '8rem' }}>
      <Combobox {...args} />
    </div>
  ),
};
