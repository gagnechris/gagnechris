import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Scrim } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Scrim',
  component: Scrim,
  parameters: catalog(
    'n/a',
    '`--neutral-900` at 40% behind every modal surface. It is a button labelled Close, kept out of the tab order.',
  ),
  args: { onClick: fn() },
  render: (args) => (
    <div
      style={{
        position: 'relative',
        height: '12rem',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <p style={{ padding: 'var(--space-4)' }}>Content behind the scrim</p>
      <Scrim {...args} />
    </div>
  ),
} satisfies Meta<typeof Scrim>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
