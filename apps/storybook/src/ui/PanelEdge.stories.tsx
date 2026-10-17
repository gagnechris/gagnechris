import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  PanelCollapseButton,
  PanelExpandEdge,
  usePanelEdgeFocus,
} from '@gagnechris/ui';
import { catalog } from '../catalog';
import '../workspace/panelStory.css';

const SIDE_ID = 'story-edge-panel';

const Panel = ({ count }: { count?: number }) => {
  const [open, setOpen] = useState(true);
  const { collapseRef, expandRef, handOff } = usePanelEdgeFocus(open);
  const edge = {
    label: 'Task panel',
    noun: 'task panel',
    controls: SIDE_ID,
    side: 'right' as const,
    shortcut: '⌘.',
    keyShortcuts: 'Meta+.',
    onToggle: (byKeyboard: boolean) => {
      handOff(byKeyboard);
      setOpen((o) => !o);
    },
  };
  return (
    <div className="story-panels">
      <div className="story-panels__main">
        Hover or Tab to the panel’s left edge to show the collapse button.
        Collapsed, the panel comes back from the thin zone on the window’s right
        edge.
      </div>
      {open ? (
        <aside id={SIDE_ID} className="story-panels__side">
          <PanelCollapseButton
            {...edge}
            ref={collapseRef}
            className="story-panels__edge"
          />
          Task panel
        </aside>
      ) : (
        <PanelExpandEdge
          {...edge}
          ref={expandRef}
          count={count}
          countLabel="open tasks"
        />
      )}
    </div>
  );
};

const meta = {
  title: 'Shared UI/PanelEdge',
  component: Panel,
  parameters: catalog(
    'web only',
    '`PanelCollapseButton` rides a panel’s edge and shows while the edge is hovered or focused; `PanelExpandEdge` is a thin zone on the window’s edge that brings a collapsed panel back, with an optional count. `usePanelEdgeFocus` moves focus from one to the other when they swap. Both are hidden under 768px.',
  ),
} satisfies Meta<typeof Panel>;

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
