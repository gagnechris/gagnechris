import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  PanelCollapseButton,
  PanelExpandEdge,
} from '@web/workspace/ui/PanelEdge';
import { ResizeHandle } from '@web/workspace/ui/ResizeHandle';
import { catalog } from '../catalog';
import './panelStory.css';

const SIDE_ID = 'story-side-panel';

const Panels = ({ count }: { count?: number }) => {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState<number | null>(null);
  const side = useRef<HTMLElement>(null);
  const edge = {
    label: 'Task panel',
    noun: 'task panel',
    controls: SIDE_ID,
    side: 'right' as const,
    shortcut: '⌘.',
    keyShortcuts: 'Meta+.',
    onToggle: () => setOpen((o) => !o),
  };
  return (
    <div className="story-panels">
      <div className="story-panels__main">
        Hover the panel's left edge to show the collapse button, or drag it to
        resize.
      </div>
      {open ? (
        <aside
          id={SIDE_ID}
          ref={side}
          className="story-panels__side"
          style={width ? { width } : undefined}
        >
          <ResizeHandle
            label="Resize task panel"
            className="story-panels__resize"
            target={side}
            width={width}
            min={224}
            max={480}
            edge="left"
            onChange={setWidth}
            onCollapse={() => setOpen(false)}
          />
          <PanelCollapseButton {...edge} className="story-panels__edge" />
          Task panel
        </aside>
      ) : (
        <PanelExpandEdge {...edge} count={count} countLabel="open tasks" />
      )}
    </div>
  );
};

const meta = {
  title: 'Workspace/PanelEdge and ResizeHandle',
  component: Panels,
  parameters: catalog(
    'web only',
    'The collapse button rides a panel’s resize edge; a collapsed panel comes back from a thin zone on the window’s edge. Arrow keys nudge the handle and a double-click resets it.',
  ),
} satisfies Meta<typeof Panels>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CollapsedWithCount: Story = {
  args: { count: 3 },
  parameters: {
    docs: {
      description: {
        story: 'Collapse the panel to see the expand zone with its count.',
      },
    },
  },
};
