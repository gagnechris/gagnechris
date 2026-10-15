import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import MarkdownPreview from '@web/kit/markdown/MarkdownPreview';
import { TaskEmbedRow } from '@web/kit/tasks/TaskEmbedRow';
import '@web/kit/markdown/markdown.css';
import { catalog } from '../catalog';
import { SAMPLE_MARKDOWN } from './sampleMarkdown';

const TASKS: Record<string, { title: string; done: boolean }> = {
  '01JAAAAAAAAAAAAAAAAAAAAAAA': { title: 'Write spec', done: false },
  '01JBBBBBBBBBBBBBBBBBBBBBBB': { title: 'Book the venue', done: true },
  '01JCCCCCCCCCCCCCCCCCCCCCCC': { title: 'Send invites', done: false },
};

const NOTE_WITH_TASKS = `**Standup**

{{task:01JAAAAAAAAAAAAAAAAAAAAAAA}}
{{task:01JBBBBBBBBBBBBBBBBBBBBBBB}}
  {{task:01JCCCCCCCCCCCCCCCCCCCCCCC}}

Notes after the tasks render as markdown again.`;

const meta = {
  title: 'Notebook/MarkdownPreview',
  component: MarkdownPreview,
  parameters: catalog(
    '`apps/mobile/src/markdown/`',
    'Renders a markdown body with the shared renderer, the same HTML the publisher writes. With `renderTaskEmbed`, `{{task:…}}` lines render as live rows. `LazyMarkdownPreview` loads it on demand.',
  ),
  args: { markdown: SAMPLE_MARKDOWN },
} satisfies Meta<typeof MarkdownPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prose: Story = {};

export const WithTaskEmbeds: Story = {
  args: {
    markdown: NOTE_WITH_TASKS,
    renderTaskEmbed: (id) => {
      const task = TASKS[id];
      return task ? (
        <TaskEmbedRow
          view={{
            kind: 'task',
            task: {
              title: task.title,
              status: task.done ? 'done' : 'todo',
              priority: 'med',
            },
            onToggle: fn(),
            to: `/tasks/${id}`,
          }}
        />
      ) : (
        <TaskEmbedRow view={{ kind: 'deleted' }} />
      );
    },
  },
};

export const TaskEmbedsAsText: Story = { args: { markdown: NOTE_WITH_TASKS } };

export const Empty: Story = { args: { markdown: '' } };
