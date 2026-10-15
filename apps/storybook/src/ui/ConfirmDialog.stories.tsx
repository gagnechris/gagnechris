import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ConfirmDialog } from '@gagnechris/ui';
import { catalog } from '../catalog';
import { OpenButton } from '../OpenButton';

const meta = {
  title: 'Shared UI/ConfirmDialog',
  component: ConfirmDialog,
  parameters: catalog(
    '`apps/mobile/src/ui/confirm.ts` (native alert)',
    'A centred yes/no question; the confirming action is styled as danger. Apps open it through `confirmStore` and `ConfirmDialogHost`.',
  ),
  args: {
    message: 'Delete this note? It moves to Recently deleted.',
    action: 'Delete',
    onAnswer: fn(),
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <OpenButton label="Delete note">
      {(close) => (
        <ConfirmDialog
          {...args}
          onAnswer={(ok) => {
            close();
            args.onAnswer(ok);
          }}
        />
      )}
    </OpenButton>
  ),
};
