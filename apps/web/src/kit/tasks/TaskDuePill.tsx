import type { TaskDue } from './taskDue';
import './taskDue.css';

export function TaskDuePill({ due }: { due: TaskDue | null | undefined }) {
  if (!due) return null;
  return (
    <span
      className="task-due"
      data-overdue={due.overdue || undefined}
      title={due.title}
    >
      {due.text}
    </span>
  );
}
