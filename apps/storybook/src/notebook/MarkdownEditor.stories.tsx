import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import MarkdownEditor from '@web/kit/markdown/MarkdownEditor';
import '@web/kit/markdown/markdown.css';
import { catalog } from '../catalog';
import { SAMPLE_MARKDOWN } from './sampleMarkdown';

const meta = {
  title: 'Notebook/MarkdownEditor',
  component: MarkdownEditor,
  parameters: catalog(
    '`apps/mobile/src/ui/LiveMarkdownInput.tsx`',
    'The plain-text CodeMirror editor under every markdown body: list continuation, line moves, image paste and drop. It fills its container’s height.',
  ),
  decorators: [
    (Story) => (
      <div style={{ height: '22rem' }}>
        <Story />
      </div>
    ),
  ],
  args: { value: SAMPLE_MARKDOWN, onChange: fn() },
} satisfies Meta<typeof MarkdownEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const Controlled = ({
  initial,
  onChange,
  lineNumbers,
  placeholder,
}: {
  initial: string;
  onChange: (value: string) => void;
  lineNumbers?: boolean;
  placeholder?: string;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      lineNumbers={lineNumbers}
      placeholder={placeholder}
    />
  );
};

export const Default: Story = {
  render: (args) => (
    <Controlled initial={args.value} onChange={args.onChange} />
  ),
};

export const WithoutLineNumbers: Story = {
  render: (args) => (
    <Controlled
      initial={args.value}
      onChange={args.onChange}
      lineNumbers={false}
    />
  ),
};

export const EmptyWithPlaceholder: Story = {
  render: (args) => (
    <Controlled
      initial=""
      onChange={args.onChange}
      placeholder="Write something…"
    />
  ),
};

export const ReadOnly: Story = { args: { readOnly: true } };
