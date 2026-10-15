import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Button',
  component: Button,
  parameters: catalog(
    '`apps/mobile/src/ui/Button.tsx` (`primary`, `secondary`)',
    'The action button for Admin and Notebook. Renders a link when given `href`.',
  ),
  args: { children: 'Save', onClick: fn() },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'primary', 'danger'],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: { variant: 'primary', children: 'Publish' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Delete' },
};

export const Disabled: Story = { args: { variant: 'primary', disabled: true } };

export const AsLink: Story = {
  args: { href: '#', children: 'View on site' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      <Button>Default</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled>Disabled</Button>
      <Button variant="primary" disabled>
        Primary disabled
      </Button>
      <Button href="#">Link</Button>
    </div>
  ),
};
