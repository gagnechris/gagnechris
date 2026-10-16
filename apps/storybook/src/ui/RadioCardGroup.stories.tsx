import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RadioCardGroup } from '@gagnechris/ui';
import { catalog } from '../catalog';

const levels = [
  {
    value: 'viewer',
    title: 'Viewer',
    description: 'Can read drafts and notes but not change them.',
  },
  {
    value: 'editor',
    title: 'Editor',
    description: 'Can write and publish posts, projects and pages.',
  },
  {
    value: 'admin',
    title: 'Admin',
    description: 'Everything an editor can do, plus managing users.',
  },
  {
    value: 'owner',
    title: 'Owner',
    description: 'Only one account can own the site.',
    disabled: true,
  },
] as const;

type Level = (typeof levels)[number]['value'];

const meta = {
  title: 'Shared UI/RadioCardGroup',
  component: RadioCardGroup,
  parameters: catalog(
    'none: rows with a check mark (`apps/mobile/src/admin/users/AccessLevelPicker.tsx`)',
    'Radios drawn as cards for choices that need a sentence each. One tab stop; arrows move the selection.',
  ),
  args: {
    label: 'Access level',
    options: levels,
    value: 'editor',
    onChange: fn(),
  },
} satisfies Meta<typeof RadioCardGroup<Level>>;

export default meta;
type Story = StoryObj<typeof meta>;

const AccessLevel = ({ initial }: { initial: Level | null }) => {
  const [value, setValue] = useState<Level | null>(initial);
  return (
    <div style={{ maxWidth: '28rem' }}>
      <RadioCardGroup
        label="Access level"
        options={levels}
        value={value}
        onChange={setValue}
      />
    </div>
  );
};

export const Default: Story = {
  render: () => <AccessLevel initial="editor" />,
};

export const NoneSelected: Story = {
  render: () => <AccessLevel initial={null} />,
};
