import type { Meta, StoryObj } from '@storybook/react-vite';
import { CarryFooter } from '@web/kit/tasks/TodayPanels';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/CarryFooter',
  component: CarryFooter,
  parameters: catalog(
    'Today screen in `apps/mobile/src/notebook/`',
    'The line under Today’s panels saying how many open tasks carry to the next day.',
  ),
  args: { count: 3, nextDay: '2026-10-16' },
} satisfies Meta<typeof CarryFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Several: Story = {};

export const One: Story = { args: { count: 1 } };

export const Nothing: Story = { args: { count: 0 } };
