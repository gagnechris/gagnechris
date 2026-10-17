import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button, Dialog, Field, TextInput } from '@gagnechris/ui';
import { catalog } from '../catalog';
import { OpenButton } from '../OpenButton';

const meta = {
  title: 'Shared UI/Dialog',
  component: Dialog,
  parameters: catalog(
    'none: modal screens in `apps/mobile/app/` and page sheets',
    'A centred modal: 480px (`sm` 400, `lg` 640), a title, a close IconButton and a footer with Cancel then the primary action. Focus moves to the first field and is trapped; Escape, the close button and the Scrim close it. Under 768px it opens as a BottomSheet with the action as Done; `cancelLabel` names its Close button and `initialFocus` still picks where focus starts.',
  ),
  args: { title: 'Invite user', onClose: fn(), children: null },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = (
  <>
    <Field label="Email" hint="They get a sign-in link">
      <TextInput type="email" placeholder="name@example.com" />
    </Field>
    <Field label="Name">
      <TextInput />
    </Field>
  </>
);

export const Default: Story = {
  render: (args) => (
    <OpenButton label="Invite user">
      {(close) => (
        <Dialog
          {...args}
          onClose={close}
          actions={
            <Button variant="primary" onClick={close}>
              Send invite
            </Button>
          }
        >
          {body}
        </Dialog>
      )}
    </OpenButton>
  ),
};

export const Small: Story = {
  render: (args) => (
    <OpenButton label="Open small dialog">
      {(close) => (
        <Dialog
          {...args}
          size="sm"
          title="Rename area"
          onClose={close}
          actions={
            <Button variant="primary" onClick={close}>
              Rename
            </Button>
          }
        >
          <Field label="Name">
            <TextInput defaultValue="Work" />
          </Field>
        </Dialog>
      )}
    </OpenButton>
  ),
};

export const Large: Story = {
  render: (args) => (
    <OpenButton label="Open large dialog">
      {(close) => (
        <Dialog {...args} size="lg" title="Keyboard shortcuts" onClose={close}>
          <p>⌘S saves, ⌘⏎ publishes, ⌘K searches.</p>
        </Dialog>
      )}
    </OpenButton>
  ),
};

export const WithoutCloseButton: Story = {
  render: (args) => (
    <OpenButton label="Open dialog">
      {(close) => (
        <Dialog
          {...args}
          hideClose
          onClose={close}
          actions={
            <Button variant="danger" onClick={close}>
              Remove access
            </Button>
          }
        >
          <p>Remove Ada’s access to Admin and Notebook?</p>
        </Dialog>
      )}
    </OpenButton>
  ),
};

const StartOnName = ({
  close,
  ...args
}: {
  close: () => void;
  title: string;
}) => {
  const name = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      {...args}
      onClose={close}
      cancelLabel="Not now"
      initialFocus={name}
      actions={
        <Button variant="primary" onClick={close}>
          Send invite
        </Button>
      }
    >
      <Field label="Email" hint="They get a sign-in link">
        <TextInput type="email" placeholder="name@example.com" />
      </Field>
      <Field label="Name">
        <TextInput ref={name} />
      </Field>
    </Dialog>
  );
};

/** Focus starts on Name and Cancel reads Not now, in the dialog and in the phone sheet. */
export const InitialFocusAndCancelLabel: Story = {
  render: (args) => (
    <OpenButton label="Invite user">
      {(close) => <StartOnName title={args.title} close={close} />}
    </OpenButton>
  ),
};
