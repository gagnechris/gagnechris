import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ComingUpPanel } from '@web/kit/tasks/TodayPanels';
import { TaskParentsContext } from '@web/kit/tasks/taskParents';
import { catalog } from '../catalog';
import { COMING_UP, DAY, PARENTS } from './todayData';

const meta = {
  title: 'Notebook/ComingUpPanel',
  component: ComingUpPanel,
  parameters: catalog(
    'Today screen in `apps/mobile/src/notebook/`',
    'The Today page’s Coming up panel: open tasks starting in the next two weeks, grouped by day. `compact` is one list with a short day on each row.',
  ),
  decorators: [
    (Story) => (
      <TaskParentsContext.Provider value={PARENTS}>
        <div style={{ maxWidth: '40rem' }}>
          <Story />
        </div>
      </TaskParentsContext.Provider>
    ),
  ],
  args: {
    days: COMING_UP,
    day: DAY,
    onToggle: fn(),
    taskTo: (task) => `/tasks/${task.id}`,
    upcomingTo: '/upcoming',
  },
} satisfies Meta<typeof ComingUpPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAddToNote: Story = { args: { onAddToNote: fn() } };

export const Compact: Story = { args: { compact: true, onAddToNote: fn() } };

export const ReadOnly: Story = { args: { readOnly: true } };

export const Empty: Story = { args: { days: [] } };

export const EmptyOneWeek: Story = { args: { days: [], horizonDays: 7 } };

export const Loading: Story = { args: { loading: true } };
