import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { TaskEmbedRow } from './TaskEmbedRow';
import { parseTaskLine } from './taskLine';
import { taskScheduleLabel } from './taskScheduleLabel';

const ID = '01JAAAAAAAAAAAAAAAAAAAAAAA';

describe('TaskEmbedRow', () => {
  test('renders checkbox, title, schedule, priority and the open link', async () => {
    const onToggle = vi.fn();
    render(
      <MemoryRouter>
        <TaskEmbedRow
          view={{
            kind: 'task',
            task: { title: 'Write spec', status: 'todo', priority: 'high' },
            schedule: '@Tue',
            onToggle,
            to: `/tasks/${ID}`,
          }}
        />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Complete Write spec' }),
    );
    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.getByText('@Tue')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open task Write spec' }),
    ).toHaveAttribute('href', `/tasks/${ID}`);
  });

  test('a pending task cannot be toggled; a deleted one is muted', () => {
    const { rerender } = render(
      <TaskEmbedRow
        view={{
          kind: 'task',
          task: { title: 'Call Sam', status: 'todo', priority: 'med' },
          pending: true,
          onToggle: () => {},
        }}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByText('Med')).toBeNull();
    rerender(<TaskEmbedRow view={{ kind: 'deleted' }} />);
    expect(screen.getByText('Deleted task')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('MarkdownPreview with task embeds', () => {
  test('renders embed lines live and the rest as markdown', () => {
    render(
      <MarkdownPreview
        markdown={`**Standup**\n{{task:${ID}}}\nafter`}
        renderTaskEmbed={(id) => <span>row {id}</span>}
      />,
    );
    expect(screen.getByText('Standup').tagName).toBe('STRONG');
    expect(screen.getByText(`row ${ID}`)).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('{{task:');
  });
});

describe('task line helpers', () => {
  test('parseTaskLine reads `[ ] title` only', () => {
    expect(parseTaskLine('  [ ] Call Sam ')).toEqual({
      indent: '  ',
      draft: {
        title: 'Call Sam',
        startDate: null,
        someday: false,
        priority: 'med',
      },
    });
    expect(parseTaskLine('- [ ] checklist')).toBeNull();
    expect(parseTaskLine('[x] done')).toBeNull();
    expect(parseTaskLine('[ ] ')).toBeNull();
  });

  test('taskScheduleLabel', () => {
    const today = '2026-10-02';
    expect(taskScheduleLabel(null, today)).toBeUndefined();
    expect(taskScheduleLabel(null, today, true)).toBe('@someday');
    expect(taskScheduleLabel('2026-10-02', today)).toBe('@today');
    expect(taskScheduleLabel('2026-10-03', today)).toBe('@tomorrow');
    expect(taskScheduleLabel('2026-10-06', today)).toBe('@Tue');
    expect(taskScheduleLabel('2026-10-12', today)).toBe('@Oct 12');
    expect(taskScheduleLabel('2026-09-28', today)).toBe('@Sep 28');
  });
});
