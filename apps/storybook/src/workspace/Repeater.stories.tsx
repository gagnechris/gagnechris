import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, TextInput } from '@gagnechris/ui';
import { Repeater } from '@web/workspace/ui/Repeater';
import { catalog } from '../catalog';

type Link = { id: string; label: string; url: string };

const startingLinks: Link[] = [
  { id: 'a', label: 'GitHub', url: 'https://github.com/gagnechris' },
  { id: 'b', label: 'Email', url: 'mailto:hello@example.com' },
];

let nextId = 0;

const LinkRepeater = ({
  reorderable,
  initial,
}: {
  reorderable?: boolean;
  initial: Link[];
}) => {
  const [links, setLinks] = useState(initial);
  return (
    <Repeater<Link>
      legend="Links"
      items={links}
      onChange={setLinks}
      createItem={() => ({ id: `new-${(nextId += 1)}`, label: '', url: '' })}
      addLabel="Add link"
      reorderable={reorderable}
      renderItem={(link, { update }) => (
        <>
          <Field label="Label">
            <TextInput
              value={link.label}
              onChange={(e) => update({ label: e.target.value })}
            />
          </Field>
          <Field label="URL">
            <TextInput
              value={link.url}
              onChange={(e) => update({ url: e.target.value })}
            />
          </Field>
        </>
      )}
    />
  );
};

const meta = {
  title: 'Workspace/Repeater',
  component: LinkRepeater,
  parameters: catalog(
    'none',
    'A fieldset of repeated rows with Add, Remove and optional Move up and Move down. Admin uses it for resume and project lists.',
  ),
  args: { initial: startingLinks },
} satisfies Meta<typeof LinkRepeater>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Reorderable: Story = { args: { reorderable: true } };

export const Empty: Story = { args: { initial: [] } };
