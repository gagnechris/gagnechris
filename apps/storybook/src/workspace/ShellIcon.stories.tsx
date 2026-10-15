import type { Meta, StoryObj } from '@storybook/react-vite';
import ShellIcon, { type ShellIconName } from '@web/workspace/ui/ShellIcon';
import { catalog } from '../catalog';

const names: ShellIconName[] = [
  'search',
  'posts',
  'home',
  'resume',
  'pages',
  'projects',
  'users',
  'notebook',
  'globe',
  'external',
  'lock',
  'passkey',
  'close',
  'plus',
  'today',
  'upcoming',
  'notes',
  'tasks',
  'templates',
  'areas',
  'more',
];

const meta = {
  title: 'Workspace/ShellIcon',
  component: ShellIcon,
  parameters: catalog(
    '`apps/mobile/src/ui/Icon.tsx`',
    'Stroke icons for the Admin and Notebook shell. They inherit the text colour.',
  ),
  args: { name: 'today', size: 16 },
  argTypes: { name: { control: 'select', options: names } },
} satisfies Meta<typeof ShellIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const Large: Story = { args: { size: 32 } };

export const AllIcons: Story = {
  render: ({ size }) => (
    <ul
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
        gap: 'var(--space-4)',
        listStyle: 'none',
        padding: 0,
      }}
    >
      {names.map((name) => (
        <li
          key={name}
          style={{
            display: 'grid',
            justifyItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <ShellIcon name={name} size={size} />
          {name}
        </li>
      ))}
    </ul>
  ),
  args: { size: 24 },
};
