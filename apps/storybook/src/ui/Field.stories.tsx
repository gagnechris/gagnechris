import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, Select, TextArea, TextInput } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Field',
  component: Field,
  parameters: catalog(
    'none; screens use React Native `TextInput` directly',
    'A labelled form control with an optional hint. `TextInput`, `TextArea` and `Select` share the `.kit-input` look.',
  ),
  args: { label: 'Title', children: null },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTextInput: Story = {
  args: {
    label: 'Title',
    children: <TextInput defaultValue="Shipping the component library" />,
  },
};

export const WithHint: Story = {
  args: {
    label: 'Slug',
    hint: 'Lowercase letters, numbers and dashes.',
    children: <TextInput defaultValue="component-library" />,
  },
};

export const WithTextArea: Story = {
  args: {
    label: 'Summary',
    fullWidth: true,
    children: (
      <TextArea
        rows={4}
        defaultValue="One library of components shared by Admin, Notebook and the public site."
      />
    ),
  },
};

export const WithSelect: Story = {
  args: {
    label: 'Area',
    children: (
      <Select defaultValue="work">
        <option value="work">Work</option>
        <option value="home">Home</option>
      </Select>
    ),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Created',
    children: <TextInput disabled defaultValue="Oct 15, 2026" />,
  },
};

export const Placeholder: Story = {
  args: {
    label: 'Search',
    children: <TextInput placeholder="Search notes" />,
  },
};
