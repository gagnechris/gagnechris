import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChipsInput } from '@gagnechris/ui';
import { catalog } from '../catalog';

const Tags = ({
  initial,
  maxItems,
}: {
  initial: string[];
  maxItems?: number;
}) => {
  const [tags, setTags] = useState(initial);
  return (
    <ChipsInput
      label="Tags"
      listLabel="Post tags"
      itemLabel={(tag) => `tag ${tag}`}
      placeholder="Add tag"
      fullPlaceholder="Tag limit reached"
      maxItems={maxItems}
      value={tags}
      onChange={setTags}
    />
  );
};

const meta = {
  title: 'Shared UI/ChipsInput',
  component: Tags,
  parameters: catalog(
    'none',
    'A list of short values typed as chips: Enter, a comma or leaving the input adds one, Backspace on an empty input removes the last.',
  ),
  args: { initial: ['react', 'design systems'] },
} satisfies Meta<typeof Tags>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { initial: [] } };

export const Full: Story = {
  args: { initial: ['go', 'aws', 'react'], maxItems: 3 },
};
