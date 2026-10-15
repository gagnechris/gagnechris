import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button, EmptyState } from '@gagnechris/ui';
import ShellIcon from '@web/workspace/ui/ShellIcon';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/EmptyState',
  component: EmptyState,
  parameters: catalog(
    '`apps/mobile/src/ui/EmptyState.tsx`',
    'A centred block for an empty list or page: a 32px ShellIcon, a title, a sentence and an optional `md` Button. No card around it.',
  ),
  args: {
    title: 'No notes yet',
    icon: <ShellIcon name="notes" size={32} />,
    children: 'Notes you write show up here, newest first.',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: { action: <Button onClick={fn()}>New note</Button> },
};

export const TitleOnly: Story = {
  args: { icon: undefined, children: undefined, title: 'Nothing due today' },
};
