import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { StillOpenPanel } from '@web/kit/tasks/TodayPanels';
import { TaskParentsContext } from '@web/kit/tasks/taskParents';
import { catalog } from '../catalog';
import { DAY, PARENTS, STILL_OPEN } from './todayData';

type FullProps = Extract<
  ComponentProps<typeof StillOpenPanel>,
  { snoozeFrom: string }
>;

const meta = {
  title: 'Notebook/StillOpenPanel',
  component: StillOpenPanel,
  parameters: catalog(
    'Today screen in `apps/mobile/src/notebook/`',
    'The Today page’s Still open panel: open tasks from earlier notes plus anything scheduled for today, each with Snooze and Drop. `compact` is the short side-panel form with a “+ Note” button.',
  ),
  decorators: [
    (Story) => (
      <TaskParentsContext.Provider value={PARENTS}>
        <div style={{ maxWidth: '40rem', minHeight: '28rem' }}>
          <Story />
        </div>
      </TaskParentsContext.Provider>
    ),
  ],
  args: {
    rows: STILL_OPEN,
    snoozeFrom: DAY,
    onToggle: fn(),
    onSnooze: fn(),
    onDrop: fn(),
  },
} satisfies Meta<FullProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAddToNote: Story = { args: { onAddToNote: fn() } };

export const ReadOnly: Story = { args: { readOnly: true } };

export const Compact: Story = {
  args: { onAddToNote: fn() },
  render: (args) => (
    <StillOpenPanel
      compact
      rows={args.rows}
      onAddToNote={args.onAddToNote ?? (() => {})}
    />
  ),
};

export const Empty: Story = { args: { rows: [] } };

export const Loading: Story = { args: { rows: [], loading: true } };

export const WithError: Story = {
  args: { error: 'Couldn’t load tasks. Check your connection and try again.' },
};
