import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, TextInput } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Field',
  component: Field,
  parameters: catalog(
    'none; screens use React Native `TextInput` directly',
    'Labels one control and describes it by its hint. An `error` replaces the hint, and the control gets `aria-invalid` and `aria-describedby`. `tone="editorial"` is the public contact form look. The controls have their own entries.',
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

export const WithError: Story = {
  args: {
    label: 'Slug',
    hint: 'Lowercase letters, numbers and dashes.',
    error: 'That slug is taken.',
    children: <TextInput defaultValue="hello-world" />,
  },
};

export const Editorial: Story = {
  args: {
    label: 'Email',
    tone: 'editorial',
    children: <TextInput type="email" placeholder="you@example.com" />,
  },
};

export const EditorialWithError: Story = {
  args: {
    label: 'Email',
    tone: 'editorial',
    error: 'Enter an email address.',
    children: <TextInput type="email" defaultValue="chris@" />,
  },
};
