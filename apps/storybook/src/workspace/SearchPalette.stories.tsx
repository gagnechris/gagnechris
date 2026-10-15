import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import SearchPalette, { type SearchHit } from '@web/workspace/ui/SearchPalette';
import { catalog } from '../catalog';
import { OpenButton } from '../OpenButton';

const groups = ['Notes', 'Tasks'] as const;

const useTaskCheck = () => {
  const [done, setDone] = useState(false);
  return { done, toggle: () => setDone((d) => !d) };
};

const Palette = ({
  close,
  initialQuery,
  error,
}: {
  close: () => void;
  initialQuery: string;
  error?: string;
}) => {
  const [q, setQ] = useState(initialQuery);
  const task = useTaskCheck();
  const hits: SearchHit[] = q
    ? [
        {
          key: 'n1',
          group: 'Notes',
          to: '/notes/1',
          title: 'Component library kickoff',
          detail: 'Oct 15',
        },
        {
          key: 'n2',
          group: 'Notes',
          to: '/notes/2',
          title: 'Storybook hosting options',
          detail: 'Work',
        },
        {
          key: 't1',
          group: 'Tasks',
          to: '/tasks/1',
          title: 'Write stories for every component',
          check: {
            checked: task.done,
            label: 'Done',
            onToggle: task.toggle,
          },
        },
      ]
    : [];
  return (
    <SearchPalette
      label="Search Notebook"
      placeholder="Search notes and tasks"
      q={q}
      onQueryChange={setQ}
      groups={groups}
      hits={hits}
      status={q ? `${hits.length} results` : undefined}
      error={error}
      onClose={close}
    />
  );
};

const meta = {
  title: 'Workspace/SearchPalette',
  component: SearchPalette,
  parameters: catalog(
    '`apps/mobile/src/ui/SearchField.tsx` (the field only)',
    'The ⌘K search dialog: grouped results, arrow keys move, Enter opens, ⌘Enter toggles a task.',
  ),
  args: {
    label: 'Search',
    placeholder: 'Search',
    q: '',
    onQueryChange: fn(),
    groups,
    hits: [],
    onClose: fn(),
  },
} satisfies Meta<typeof SearchPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithResults: Story = {
  render: () => (
    <OpenButton label="Open search">
      {(close) => <Palette close={close} initialQuery="story" />}
    </OpenButton>
  ),
};

export const Empty: Story = {
  render: () => (
    <OpenButton label="Open search">
      {(close) => <Palette close={close} initialQuery="" />}
    </OpenButton>
  ),
};

export const WithError: Story = {
  render: () => (
    <OpenButton label="Open search">
      {(close) => (
        <Palette
          close={close}
          initialQuery="story"
          error="Search is unavailable. Try again."
        />
      )}
    </OpenButton>
  ),
};
