import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { DemoFrame } from '@web/kit/demo/DemoFrame';
import { catalog } from '../catalog';

const meta = {
  title: 'Public demos/DemoFrame',
  component: DemoFrame,
  parameters: catalog(
    'web only',
    'The frame around a project page’s Try it demo: the sample-data note and a Reset button that also remounts the demo. `split` puts the note in the slot’s label row and hands Reset to the demo’s own toolbar.',
  ),
  args: {
    onReset: fn(),
    children: (
      <p style={{ margin: 0 }}>
        The demo renders here. Type something, then press Reset.
      </p>
    ),
  },
} satisfies Meta<typeof DemoFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {
  render: (args) => (
    <DemoFrame onReset={args.onReset}>
      <label className="kit-field">
        <span>Scratch input (cleared by Reset)</span>
        <input className="kit-input" defaultValue="Typed but not sent" />
      </label>
    </DemoFrame>
  ),
};

export const Split: Story = {
  render: (args) => (
    <DemoFrame
      layout="split"
      note="Sample notes, runs in your browser, nothing is saved"
      resetLabel="Reset demo"
      onReset={args.onReset}
    >
      {(resetButton) => (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="button" className="ui-btn">
              New note
            </button>
            {resetButton}
          </div>
          <p style={{ margin: 0 }}>The demo’s own body goes here.</p>
        </div>
      )}
    </DemoFrame>
  ),
};
