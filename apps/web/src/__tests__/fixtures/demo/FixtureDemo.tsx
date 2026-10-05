import { useState } from 'react';
import {
  parseTaskSyntax,
  type TaskPriority,
  type TaskStatus,
} from '@gagnechris/shared';
import { Button } from '../../../kit/Button';
import { DemoFrame } from '../../../kit/demo/DemoFrame';
import { useDemoReducer } from '../../../kit/demo/useDemoReducer';
import { TaskRow } from '../../../kit/tasks/TaskRow';
import type { ProjectDemoProps } from '../../../projects/demoLoaders';

type DemoTask = {
  id: number;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
};

type Action = { type: 'add'; input: string } | { type: 'toggle'; id: number };

const seed = (): DemoTask[] => [
  { id: 1, title: 'Seeded open task', priority: 'med', status: 'todo' },
  { id: 2, title: 'Seeded done task', priority: 'low', status: 'done' },
];

const reducer = (tasks: DemoTask[], action: Action): DemoTask[] => {
  if (action.type === 'toggle') {
    return tasks.map((t) =>
      t.id === action.id
        ? { ...t, status: t.status === 'done' ? 'todo' : 'done' }
        : t,
    );
  }
  const parsed = parseTaskSyntax(action.input);
  if (!parsed.title) return tasks;
  const id = Math.max(0, ...tasks.map((t) => t.id)) + 1;
  return [
    ...tasks,
    { id, title: parsed.title, priority: parsed.priority, status: 'todo' },
  ];
};

/** Proves the demo plumbing in tests; never registered in a production build. */
export default function FixtureDemo({ project }: ProjectDemoProps) {
  const { state, dispatch, reset } = useDemoReducer(reducer, seed);
  return (
    <DemoFrame onReset={reset}>
      <FixtureBody
        projectName={project.name}
        tasks={state}
        onAdd={(input) => dispatch({ type: 'add', input })}
        onToggle={(id) => dispatch({ type: 'toggle', id })}
      />
    </DemoFrame>
  );
}

function FixtureBody({
  projectName,
  tasks,
  onAdd,
  onToggle,
}: {
  projectName: string;
  tasks: DemoTask[];
  onAdd: (input: string) => void;
  onToggle: (id: number) => void;
}) {
  const [input, setInput] = useState('');
  return (
    <>
      <form
        className="admin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(input);
          setInput('');
        }}
      >
        <input
          className="admin-input"
          aria-label={`Add a task to ${projectName}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit" variant="primary">
          Add
        </Button>
      </form>
      <ul className="admin-post-list" aria-label="Demo tasks">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            variant="list"
            onToggle={() => onToggle(task.id)}
            meta={task.status}
          />
        ))}
      </ul>
    </>
  );
}
