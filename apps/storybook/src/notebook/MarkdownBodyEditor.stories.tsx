import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MarkdownBodyEditor } from '@web/kit/markdown/MarkdownBodyEditor';
import { catalog } from '../catalog';
import { SAMPLE_MARKDOWN } from './sampleMarkdown';

const meta = {
  title: 'Notebook/MarkdownBodyEditor',
  component: MarkdownBodyEditor,
  parameters: catalog(
    '`apps/mobile/src/ui/LiveMarkdownInput.tsx`',
    'The body editor for posts and notes: an insert toolbar (image, link, code block) over a live-preview `MarkdownEditor` that shows markdown only on the selected lines.',
  ),
  args: {
    value: SAMPLE_MARKDOWN,
    onChange: fn(),
    onUploadImages: fn(async (files: File[]) =>
      files.map((f) => `/media/${f.name}`),
    ),
  },
} satisfies Meta<typeof MarkdownBodyEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const Controlled = ({
  initial,
  onChange,
  onUploadImages,
  previewPage,
}: {
  initial: string;
  onChange: (value: string) => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
  previewPage?: { href: string; onOpen: () => void };
}) => {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownBodyEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      onUploadImages={onUploadImages}
      previewPage={previewPage}
    />
  );
};

export const Default: Story = {
  render: (args) => (
    <Controlled
      initial={args.value}
      onChange={args.onChange}
      onUploadImages={args.onUploadImages}
    />
  ),
};

export const WithPreviewPage: Story = {
  args: { previewPage: { href: '#preview', onOpen: fn() } },
  render: (args) => (
    <Controlled
      initial={args.value}
      onChange={args.onChange}
      onUploadImages={args.onUploadImages}
      previewPage={args.previewPage}
    />
  ),
};

export const Empty: Story = {
  render: (args) => (
    <Controlled
      initial=""
      onChange={args.onChange}
      onUploadImages={args.onUploadImages}
    />
  ),
};
