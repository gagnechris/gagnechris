import { useCallback, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EditorAccessoryBar } from '@web/kit/markdown/EditorAccessoryBar';
import MarkdownEditor, {
  type MarkdownEditorHandle,
} from '@web/kit/markdown/MarkdownEditor';
import '@web/kit/markdown/markdown.css';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/EditorAccessoryBar',
  component: EditorAccessoryBar,
  parameters: {
    ...catalog(
      'keyboard toolbar in `apps/mobile/src/ui/LiveMarkdownInput.tsx`',
      'The phone formatting bar pinned above the on-screen keyboard. Its buttons never take focus, so the editor keeps the caret. Here it sits at the bottom of the frame under a note editor.',
    ),
    layout: 'fullscreen',
  },
  args: { getView: () => undefined, tasks: true },
} satisfies Meta<typeof EditorAccessoryBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const WithEditor = ({ tasks }: { tasks: boolean }) => {
  const ref = useRef<MarkdownEditorHandle>(null);
  const [value, setValue] = useState(
    'Standup\n\nPlace the caret on a line, then use the bar below.\n',
  );
  const getView = useCallback(() => ref.current?.view(), []);
  return (
    <>
      <div style={{ height: '16rem', padding: 'var(--space-3)' }}>
        <MarkdownEditor
          ref={ref}
          value={value}
          onChange={setValue}
          lineNumbers={false}
        />
      </div>
      <EditorAccessoryBar getView={getView} tasks={tasks} />
    </>
  );
};

export const WithTaskButtons: Story = {
  render: (args) => <WithEditor tasks={args.tasks} />,
};

export const FormattingOnly: Story = {
  args: { tasks: false },
  render: (args) => <WithEditor tasks={args.tasks} />,
};
