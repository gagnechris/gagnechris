import type { Meta, StoryObj } from '@storybook/react-vite';
import { BottomSheet, Button, Field, TextInput } from '@gagnechris/ui';
import { catalog } from '../catalog';
import { OpenButton } from '../OpenButton';

const meta = {
  title: 'Shared UI/BottomSheet',
  component: BottomSheet,
  parameters: catalog(
    'none: page sheets',
    'A phone bottom sheet with a grabber, Close, title and Done. Drag the grabber down to dismiss.',
  ),
  args: { title: 'Project details', onClose: () => {}, children: null },
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <OpenButton label="Open sheet">
      {(close) => (
        <BottomSheet {...args} onClose={close}>
          <Field label="Title">
            <TextInput defaultValue="Notebook" />
          </Field>
        </BottomSheet>
      )}
    </OpenButton>
  ),
};

export const CustomDone: Story = {
  render: (args) => (
    <OpenButton label="Open sheet">
      {(close) => (
        <BottomSheet
          {...args}
          title="Invite"
          onClose={close}
          done={
            <Button variant="primary" onClick={close}>
              Send
            </Button>
          }
        >
          <Field label="Email">
            <TextInput type="email" placeholder="name@example.com" />
          </Field>
        </BottomSheet>
      )}
    </OpenButton>
  ),
};
