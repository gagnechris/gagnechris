import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton, Toolbar, ToolbarSeparator } from '@gagnechris/ui';
import ShellIcon from '@web/workspace/ui/ShellIcon';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Toolbar',
  component: Toolbar,
  parameters: catalog(
    'none: the keyboard toolbar in `apps/mobile/src/ui/LiveMarkdownInput.tsx`',
    'A row of IconButtons in a bordered box with optional separators. `role="toolbar"` with one tab stop; arrows move, Home and End jump. The phone editor accessory bar uses `lg` buttons.',
  ),
  args: { label: 'Formatting', children: null },
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

const Formatting = ({ size }: { size: 'md' | 'lg' }) => {
  const [preview, setPreview] = useState(false);
  return (
    <Toolbar label="Formatting">
      <IconButton size={size} label="Insert link">
        <ShellIcon name="external" />
      </IconButton>
      <IconButton size={size} label="Insert task">
        <ShellIcon name="tasks" />
      </IconButton>
      <IconButton size={size} label="Insert image">
        <ShellIcon name="projects" />
      </IconButton>
      <ToolbarSeparator />
      <IconButton
        size={size}
        label="Preview"
        pressed={preview}
        onClick={() => setPreview(!preview)}
      >
        <ShellIcon name="globe" />
      </IconButton>
      <IconButton size={size} label="Lock" disabled>
        <ShellIcon name="lock" />
      </IconButton>
    </Toolbar>
  );
};

export const Default: Story = { render: () => <Formatting size="md" /> };

export const PhoneAccessoryBar: Story = {
  render: () => <Formatting size="lg" />,
};
