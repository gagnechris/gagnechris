import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CarryFooter } from '@web/kit/tasks/TodayPanels';
import { TodaySheet } from '@web/kit/tasks/TodaySheet';
import { TaskParentsContext } from '@web/kit/tasks/taskParents';
import { catalog } from '../catalog';
import { OpenButton } from '../OpenButton';
import { COMING_UP, DAY, PARENTS, STILL_OPEN } from './todayData';

const meta = {
  title: 'Notebook/TodaySheet',
  component: TodaySheet,
  parameters: catalog(
    'Today screen in `apps/mobile/src/notebook/`',
    'Still open and Coming up as a phone bottom sheet with two tabs. Swipe a Still open row left, or tap ⋯, to snooze or drop it; pull the handle down to close.',
  ),
  decorators: [
    (Story) => (
      <TaskParentsContext.Provider value={PARENTS}>
        <Story />
      </TaskParentsContext.Provider>
    ),
  ],
  args: {
    stillOpen: STILL_OPEN,
    comingUp: COMING_UP,
    day: DAY,
    snoozeFrom: DAY,
    onClose: fn(),
    onToggle: fn(),
    onSnooze: fn(),
    onDrop: fn(),
    onAddToNote: fn(),
    taskTo: (task) => `/tasks/${task.id}`,
  },
  render: (args) => (
    <OpenButton label="Open today’s tasks">
      {(close) => (
        <TodaySheet
          {...args}
          onClose={() => {
            close();
            args.onClose();
          }}
        />
      )}
    </OpenButton>
  ),
} satisfies Meta<typeof TodaySheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFooter: Story = {
  args: { footer: <CarryFooter count={4} nextDay="2026-10-16" /> },
};

export const ReadOnly: Story = {
  args: { readOnly: true, onAddToNote: undefined },
};

export const Empty: Story = { args: { stillOpen: [], comingUp: [] } };

export const Loading: Story = { args: { loading: true } };

export const WithError: Story = {
  args: { error: 'Couldn’t load tasks. Check your connection and try again.' },
};
