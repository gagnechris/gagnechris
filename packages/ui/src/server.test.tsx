// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BottomSheet,
  Button,
  Card,
  Checkbox,
  Chip,
  ChipSelect,
  ChipsInput,
  Combobox,
  ConfirmDialog,
  DateInput,
  Dialog,
  DragHandle,
  Drawer,
  EmptyState,
  Field,
  FileInput,
  IconButton,
  List,
  ListRow,
  Menu,
  MenuItem,
  RadioCardGroup,
  Scrim,
  SearchInput,
  SegmentedRadio,
  Select,
  StatusBadge,
  Tabs,
  TextArea,
  TextInput,
  Toolbar,
  ToolbarSeparator,
} from './index.js';

const noop = () => {};

describe('components render without a browser', () => {
  it.each([
    ['Button', <Button>Save</Button>, 'Save'],
    ['Button as a link', <Button href="/posts">Posts</Button>, 'href="/posts"'],
    [
      'Button loading, editorial',
      <Button loading tone="editorial">
        Send
      </Button>,
      'aria-busy="true"',
    ],
    [
      'IconButton',
      <IconButton label="Search" count={2}>
        <svg />
      </IconButton>,
      'aria-label="Search, 2"',
    ],
    [
      'Field',
      <Field label="Title" hint="Shown in lists">
        <TextInput defaultValue="Hello" />
      </Field>,
      'Shown in lists',
    ],
    [
      'Field with an error',
      <Field label="Email" error="Required" tone="editorial">
        <TextInput prefix="@" />
      </Field>,
      'aria-invalid="true"',
    ],
    ['TextArea', <TextArea defaultValue="Body" />, 'Body'],
    [
      'Select',
      <Select defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
      'kit-input',
    ],
    ['DateInput', <DateInput defaultValue="2026-10-15" />, 'type="date"'],
    [
      'SearchInput',
      <SearchInput aria-label="Search" value="tax" onValueChange={noop} />,
      'Clear search',
    ],
    [
      'FileInput',
      <FileInput aria-label="Cover" onFiles={noop} />,
      'Choose file',
    ],
    [
      'Combobox',
      <Combobox
        aria-label="Note"
        value=""
        onValueChange={noop}
        options={[{ id: 'a', label: 'Alpha' }]}
        onPick={noop}
      />,
      'role="combobox"',
    ],
    [
      'Checkbox',
      <Checkbox label="Done" shape="round" dropped defaultChecked />,
      'ui-check--round',
    ],
    [
      'RadioCardGroup',
      <RadioCardGroup
        label="Level"
        value="a"
        onChange={noop}
        options={[{ value: 'a', title: 'Admin', description: 'Everything' }]}
      />,
      'role="radiogroup"',
    ],
    [
      'Chip',
      <Chip tone="warning" onRemove={noop}>
        Overdue
      </Chip>,
      'Remove Overdue',
    ],
    [
      'ChipSelect',
      <ChipSelect label="Area" value={null} onChange={noop} options={[]} />,
      'Add area',
    ],
    [
      'ChipsInput',
      <ChipsInput
        label="Tags"
        listLabel="Post tags"
        placeholder="Add tag"
        value={['react']}
        onChange={noop}
      />,
      'Remove react',
    ],
    [
      'Tabs',
      <Tabs
        label="Views"
        selected="a"
        onSelect={noop}
        items={[
          { key: 'a', label: 'A', panel: 'Panel A' },
          { key: 'b', label: 'B', count: 3, panel: 'Panel B' },
        ]}
      />,
      'role="tablist"',
    ],
    [
      'Menu',
      <Menu
        label="Actions"
        trigger={(props) => (
          <button type="button" {...props}>
            More
          </button>
        )}
      >
        <MenuItem>Rename</MenuItem>
      </Menu>,
      'aria-haspopup="menu"',
    ],
    [
      'Dialog',
      <Dialog
        title="Invite user"
        onClose={noop}
        actions={<Button>Send</Button>}
      >
        Body
      </Dialog>,
      'Invite user',
    ],
    [
      'Drawer',
      <Drawer title="Edit user" onClose={noop}>
        Body
      </Drawer>,
      'ui-drawer',
    ],
    ['Scrim', <Scrim onClick={noop} />, 'aria-label="Close"'],
    ['Card', <Card title="Profile">Body</Card>, 'ui-card'],
    [
      'Card, editorial',
      <Card tone="editorial" title="Notebook" href="/projects/notebook" />,
      'ui-card--editorial',
    ],
    [
      'ListRow',
      <List>
        <ListRow title="Hello" href="/posts/hello" meta="Today" current />
      </List>,
      'aria-current="true"',
    ],
    [
      'Toolbar',
      <Toolbar label="Formatting">
        <IconButton label="Bold">B</IconButton>
        <ToolbarSeparator />
      </Toolbar>,
      'role="toolbar"',
    ],
    ['DragHandle', <DragHandle item="Intro" onMove={noop} />, 'Reorder Intro'],
    [
      'EmptyState',
      <EmptyState title="No notes yet">Write one.</EmptyState>,
      'No notes yet',
    ],
    [
      'StatusBadge',
      <StatusBadge status="published" hasUnpublishedChanges />,
      'Unpublished changes',
    ],
    [
      'SegmentedRadio',
      <SegmentedRadio
        label="Status"
        options={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft', count: 2 },
        ]}
        value="all"
        onChange={noop}
      />,
      'role="radiogroup"',
    ],
    [
      'ConfirmDialog',
      <ConfirmDialog
        message="Delete this note?"
        action="Delete"
        onAnswer={noop}
      />,
      'Delete this note?',
    ],
  ])('%s', (_name, element, expected) => {
    expect(renderToString(element)).toContain(expected);
  });

  it('BottomSheet renders nothing on the server', () => {
    expect(
      renderToString(
        <BottomSheet title="Details" onClose={noop}>
          Body
        </BottomSheet>,
      ),
    ).toBe('');
  });
});
