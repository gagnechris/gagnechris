import { useId } from 'react';
import './taskSyntax.css';

const ROWS: [string, string][] = [
  ['@tomorrow', 'Hide until tomorrow'],
  ['@mon', 'Hide until Monday (on a Monday, the next one)'],
  ['@next week', 'Hide until next Monday'],
  ['@oct 12', 'Hide until that date'],
  ['@someday', 'Park it, no date'],
  ['!high', 'Priority (or !med, !low)'],
];

export function TaskSyntaxCheatSheet() {
  const headingId = useId();
  return (
    <section className="task-cheatsheet" aria-labelledby={headingId}>
      <h2 id={headingId}>Writing tasks</h2>
      <dl>
        {ROWS.map(([syntax, meaning]) => (
          <div key={syntax} style={{ display: 'contents' }}>
            <dt>
              <code>{syntax}</code>
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
