import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Button',
  component: Button,
  parameters: catalog(
    '`apps/mobile/src/ui/Button.tsx` (`primary`, `secondary` map to web `primary`, `default`)',
    'The action button. Variants `default`, `primary`, `danger`, `ghost` and `link`; sizes `sm`, `md` and `lg`; `loading` shows a spinner and keeps focus. Renders a link when given `href`. `tone="editorial"` is the public site look.',
  ),
  args: { children: 'Save', onClick: fn() },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'primary', 'danger', 'ghost', 'link'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    tone: { control: 'inline-radio', options: ['default', 'editorial'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
  alignItems: 'center',
} as const;

export const Default: Story = {};

export const Primary: Story = {
  args: { variant: 'primary', children: 'Publish' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Delete' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Skip' },
};

export const Link: Story = {
  args: { variant: 'link', children: 'Use a template' },
};

export const Disabled: Story = { args: { variant: 'primary', disabled: true } };

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: 'Publishing' },
};

export const AsLink: Story = {
  args: { href: '#', children: 'View on site' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} style={row}>
          <Button size={size}>Default</Button>
          <Button size={size} variant="primary">
            Primary
          </Button>
          <Button size={size} variant="danger">
            Danger
          </Button>
          <Button size={size} variant="ghost">
            Ghost
          </Button>
          <Button size={size} variant="link">
            Link
          </Button>
          <Button size={size} disabled>
            Disabled
          </Button>
          <Button size={size} variant="primary" disabled>
            Primary disabled
          </Button>
          <Button size={size} variant="primary" loading>
            Loading
          </Button>
        </div>
      ))}
      <div style={row}>
        <Button href="#">As a link</Button>
      </div>
    </div>
  ),
};

export const Editorial: Story = {
  render: () => (
    <div style={row}>
      <Button tone="editorial" variant="primary">
        Send message
      </Button>
      <Button tone="editorial">Try again</Button>
      <Button tone="editorial" variant="primary" loading>
        Sending
      </Button>
      <Button tone="editorial" variant="primary" disabled>
        Disabled
      </Button>
    </div>
  ),
};
