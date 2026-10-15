import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Card } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Card',
  component: Card,
  parameters: catalog(
    '`Card` in `apps/mobile/src/site/ui.tsx`, `apps/mobile/src/ui/AccountCard.tsx`',
    'One boxed card with 8px corners and `--shadow-sm`. `compact` padding, `interactive` when given `href` or `onClick` (the whole card is one link or button), `selected`, and `flat` for nested groups. `tone="editorial"` is an entry in a ruled list with a preview column.',
  ),
  args: {
    title: 'Profile',
    meta: 'Shown at the top of the homepage',
    children: <p style={{ margin: 0 }}>Name, headline and photo.</p>,
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const grid = {
  display: 'grid',
  gap: 'var(--space-4)',
  gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))',
} as const;

export const Boxed: Story = {};

export const Compact: Story = { args: { compact: true } };

export const Flat: Story = { args: { variant: 'flat' } };

export const InteractiveLink: Story = { args: { href: '#' } };

export const InteractiveButton: Story = { args: { onClick: fn() } };

export const Selected: Story = { args: { onClick: fn(), selected: true } };

export const AllVariants: Story = {
  render: () => (
    <div style={grid}>
      <Card title="Boxed" meta="Default">
        Static content.
      </Card>
      <Card title="Compact" meta="16px padding" compact>
        Tighter.
      </Card>
      <Card title="Flat" meta="Nested group" variant="flat">
        No shadow.
      </Card>
      <Card title="Link card" meta="Hover me" href="#" />
      <Card title="Button card" meta="Hover me" onClick={() => {}} />
      <Card
        title="Selected"
        meta="Current choice"
        onClick={() => {}}
        selected
      />
    </div>
  ),
};

const preview = (
  <div
    style={{
      aspectRatio: '4 / 3',
      background:
        'linear-gradient(135deg, var(--primary-100), var(--primary-300))',
    }}
  />
);

export const Editorial: Story = {
  render: () => (
    <div>
      <Card
        tone="editorial"
        title="Notebook"
        href="#"
        meta="2026 · React, Go, DynamoDB"
        preview={preview}
      >
        <p style={{ margin: 0 }}>A daily notebook with tasks and templates.</p>
      </Card>
      <Card
        tone="editorial"
        title="Bears"
        href="#"
        meta="2025 · Canvas games"
        preview={preview}
      >
        <p style={{ margin: 0 }}>Small games for small people.</p>
      </Card>
      <Card tone="editorial" title="Without a preview" href="#" meta="2024" />
    </div>
  ),
};
