import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '@gagnechris/ui';
import { EditorActionBar } from '@web/workspace/ui/EditorActionBar';
import { catalog } from '../catalog';

const meta = {
  title: 'Workspace/EditorActionBar',
  component: EditorActionBar,
  parameters: catalog(
    'header buttons on each editor screen',
    'The status and actions above an Admin editor. On phones the secondary actions fold into the More menu.',
  ),
  args: {
    status: 'draft',
    hasUnpublishedChanges: false,
    saveState: 'idle',
    dirty: false,
    busy: false,
    onPublish: fn(),
    onUnpublish: fn(),
    onDiscard: fn(),
    onSave: fn(),
  },
} satisfies Meta<typeof EditorActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = {};

export const DraftWithEdits: Story = { args: { dirty: true } };

export const Saving: Story = {
  args: { dirty: true, saveState: 'saving', busy: true },
};

export const Published: Story = {
  args: { status: 'published', viewLiveHref: 'https://gagnechris.com/posts' },
};

export const PublishedWithChanges: Story = {
  args: {
    status: 'published',
    hasUnpublishedChanges: true,
    saveState: 'saved',
    viewLiveHref: 'https://gagnechris.com/posts',
  },
};

export const SaveFailed: Story = { args: { dirty: true, saveState: 'error' } };

export const WithExtraActions: Story = {
  args: {
    leading: <strong>Projects</strong>,
    extraActions: <Button>Preview</Button>,
    menuActions: <Button variant="danger">Delete</Button>,
  },
};
