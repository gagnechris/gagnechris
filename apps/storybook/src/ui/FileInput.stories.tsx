import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Field, FileInput } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/FileInput',
  component: FileInput,
  parameters: catalog(
    'none',
    'A dashed drop zone with a `sm` Button and a hint. Dragging a file over it turns it `--primary-600` on `--primary-50`; `uploading` shows the file name and a progress bar.',
  ),
  args: {
    'aria-label': 'Cover image',
    accept: 'image/*',
    hint: 'PNG or JPEG, up to 5 MB. Or drop a file here.',
    onFiles: fn(),
  },
} satisfies Meta<typeof FileInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InField: Story = {
  render: (args) => (
    <Field label="Cover image" fullWidth>
      <FileInput {...args} aria-label={undefined} />
    </Field>
  ),
};

export const Uploading: Story = {
  args: { uploading: { name: 'notebook-cover.png', progress: 0.45 } },
};

export const UploadingIndeterminate: Story = {
  args: { uploading: { name: 'notebook-cover.png' } },
};

export const Disabled: Story = { args: { disabled: true } };

export const DragOver: Story = { args: { className: 'ui-file--over' } };
