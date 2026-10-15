import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button, Checkbox, Drawer, Field, TextInput } from '@gagnechris/ui';
import { catalog } from '../catalog';
import { OpenButton } from '../OpenButton';

const meta = {
  title: 'Shared UI/Drawer',
  component: Drawer,
  parameters: catalog(
    'modal screens in `apps/mobile/app/`',
    'A 400px panel from the right edge, full height: a header with title and close, a scrolling body and a footer. Same focus rules as Dialog. Under 768px it opens as a BottomSheet.',
  ),
  args: { title: 'Edit user', onClose: fn(), children: null },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <OpenButton label="Edit user">
      {(close) => (
        <Drawer
          {...args}
          onClose={close}
          actions={
            <Button variant="primary" onClick={close}>
              Save
            </Button>
          }
        >
          <Field label="Name">
            <TextInput defaultValue="Ada Lovelace" />
          </Field>
          <Field label="Email">
            <TextInput type="email" defaultValue="ada@example.com" />
          </Field>
          <Checkbox label="Can use Notebook" defaultChecked />
        </Drawer>
      )}
    </OpenButton>
  ),
};

export const WithoutFooter: Story = {
  render: (args) => (
    <OpenButton label="Show details">
      {(close) => (
        <Drawer {...args} title="Sign-in history" onClose={close}>
          <p>Last signed in Oct 14 from Safari on iPhone.</p>
        </Drawer>
      )}
    </OpenButton>
  ),
};
