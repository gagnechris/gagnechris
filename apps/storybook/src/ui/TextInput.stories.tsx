import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, TextInput } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/TextInput',
  component: TextInput,
  parameters: catalog(
    'none; screens use React Native `TextInput` directly',
    'The one control box: 36px (`sm` 32, `lg` 44), hover and focus ring, disabled and invalid states. `prefix` shows fixed text before the value. Inside a Field it is labelled and described for you.',
  ),
  args: { 'aria-label': 'Title', defaultValue: 'Notebook' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    tone: { control: 'inline-radio', options: ['default', 'editorial'] },
  },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Placeholder: Story = {
  args: { defaultValue: undefined, placeholder: 'Untitled' },
};

export const Disabled: Story = { args: { disabled: true } };

export const Invalid: Story = { args: { invalid: true } };

export const WithPrefix: Story = {
  args: { prefix: '/posts/', defaultValue: 'component-library' },
};

export const Editorial: Story = {
  args: {
    tone: 'editorial',
    placeholder: 'Your name',
    defaultValue: undefined,
  },
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '24rem' }}>
      <Field label="Small">
        <TextInput size="sm" defaultValue="Small" />
      </Field>
      <Field label="Medium">
        <TextInput defaultValue="Medium" />
      </Field>
      <Field label="Large">
        <TextInput size="lg" defaultValue="Large" />
      </Field>
      <Field label="Placeholder">
        <TextInput placeholder="Untitled" />
      </Field>
      <Field label="Disabled">
        <TextInput disabled defaultValue="Oct 15, 2026" />
      </Field>
      <Field label="Error" error="Required">
        <TextInput />
      </Field>
      <Field label="Slug" hint="Shown in the address">
        <TextInput prefix="/posts/" defaultValue="hello" />
      </Field>
      <Field label="Editorial" tone="editorial">
        <TextInput placeholder="Your name" />
      </Field>
      <Field label="Editorial error" tone="editorial" error="Enter your name.">
        <TextInput />
      </Field>
    </div>
  ),
};
