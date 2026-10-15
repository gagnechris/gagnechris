import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, TextArea } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/TextArea',
  component: TextArea,
  parameters: catalog(
    'none; screens use a multiline React Native `TextInput`',
    'Grows with its text up to 12 lines, then scrolls. `autoGrow={false}` keeps a fixed, resizable box.',
  ),
  args: {
    'aria-label': 'Summary',
    rows: 3,
    defaultValue:
      'One library of components shared by Admin, Notebook and the public site.',
  },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Fixed: Story = { args: { autoGrow: false } };

export const Disabled: Story = { args: { disabled: true } };

export const InField: Story = {
  render: (args) => (
    <Field label="Summary" hint="Shown on the blog index" fullWidth>
      <TextArea {...args} aria-label={undefined} />
    </Field>
  ),
};

export const WithError: Story = {
  render: (args) => (
    <Field label="Summary" error="Keep it under 200 characters" fullWidth>
      <TextArea {...args} aria-label={undefined} />
    </Field>
  ),
};
