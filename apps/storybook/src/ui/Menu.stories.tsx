import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  Button,
  IconButton,
  Menu,
  MenuGroup,
  MenuItem,
  MenuRadioGroup,
  MenuSeparator,
} from '@gagnechris/ui';
import ShellIcon from '@web/workspace/ui/ShellIcon';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Menu',
  component: Menu,
  parameters: catalog(
    'none: `ActionSheetIOS` (`pickFromSheet` in `apps/mobile/src/ui/Chip.tsx`, `notebook/taskActionSheets`)',
    'One Menu surface opened from a trigger with `aria-haspopup` and `aria-expanded`. Arrows move, typing jumps, Enter picks, Escape and an outside click close and return focus. Items take an icon, a shortcut, `danger` and `disabled`; MenuRadioGroup marks the current item with a check. Under 768px the same items open in a BottomSheet, with focus on the first item and the same keys.',
  ),
  args: {
    label: 'Note actions',
    trigger: (props) => (
      <IconButton {...props} label="Note actions">
        <ShellIcon name="more" />
      </IconButton>
    ),
    children: null,
  },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

const frame = { minHeight: '22rem' } as const;

const NoteMenu = ({ onAction }: { onAction: (action: string) => void }) => {
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated');
  return (
    <div style={frame}>
      <Menu
        label="Note actions"
        trigger={(props) => (
          <IconButton {...props} label="Note actions">
            <ShellIcon name="more" />
          </IconButton>
        )}
      >
        <MenuGroup label="Note">
          <MenuItem
            icon={<ShellIcon name="posts" />}
            shortcut="R"
            onSelect={() => onAction('rename')}
          >
            Rename
          </MenuItem>
          <MenuItem
            icon={<ShellIcon name="templates" />}
            onSelect={() => onAction('template')}
          >
            Save as template
          </MenuItem>
          <MenuItem icon={<ShellIcon name="lock" />} disabled>
            Lock (owner only)
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuRadioGroup
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'updated', label: 'Last updated' },
            { value: 'created', label: 'Date created' },
            { value: 'title', label: 'Title' },
          ]}
        />
        <MenuSeparator />
        <MenuItem
          danger
          icon={<ShellIcon name="close" />}
          onSelect={() => onAction('delete')}
        >
          Delete note
        </MenuItem>
      </Menu>
    </div>
  );
};

export const Default: Story = {
  render: () => <NoteMenu onAction={fn()} />,
};

export const ButtonTrigger: Story = {
  render: () => (
    <div style={frame}>
      <Menu
        label="Move task"
        width={200}
        trigger={(props) => <Button {...props}>Move to…</Button>}
      >
        <MenuItem onSelect={fn()}>Today</MenuItem>
        <MenuItem onSelect={fn()}>Tomorrow</MenuItem>
        <MenuItem onSelect={fn()}>Next week</MenuItem>
      </Menu>
    </div>
  ),
};

export const AlignEnd: Story = {
  render: () => (
    <div style={{ ...frame, display: 'flex', justifyContent: 'flex-end' }}>
      <Menu
        label="Row actions"
        align="end"
        trigger={(props) => (
          <IconButton {...props} label="Row actions" variant="outline">
            <ShellIcon name="more" />
          </IconButton>
        )}
      >
        <MenuItem onSelect={fn()}>Duplicate</MenuItem>
        <MenuItem onSelect={fn()} danger>
          Delete
        </MenuItem>
      </Menu>
    </div>
  ),
};
