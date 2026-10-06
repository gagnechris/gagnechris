import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import {
  taskDateMenuIds,
  type TaskDateKind,
  type TaskDateMenuItem,
} from './taskDateMenuItems';
import './taskSyntax.css';

type Picker = {
  value: string;
  onChange: (value: string) => void;
  onSet: () => void;
  onCancel: () => void;
};

type Props = {
  baseId: string;
  open: boolean;
  kind: TaskDateKind;
  items: TaskDateMenuItem[];
  activeIndex: number;
  onChoose: (item: TaskDateMenuItem) => void;
  onActivate: (index: number) => void;
  /** Set while Pick a date… asks for the day. */
  picker: Picker | null;
  /** Shown under show-on dates; deadlines have their own. */
  hint: string;
  style?: CSSProperties;
  /** A row of chips above the phone keyboard's accessory bar. */
  docked?: boolean;
};

const DUE_HINT = 'A deadline; it does not change when the task shows.';

/** The `@` and `due:` date menu; the field that owns the caret handles the keys. */
export function TaskDateMenu({
  baseId,
  open,
  kind,
  items,
  activeIndex,
  onChoose,
  onActivate,
  picker,
  hint,
  style,
  docked,
}: Props) {
  const ids = taskDateMenuIds(baseId);
  const pickerRef = useRef<HTMLInputElement>(null);
  const picking = picker !== null;
  useLayoutEffect(() => {
    if (picking) pickerRef.current?.focus();
  }, [picking]);

  return (
    <>
      <div
        className={`task-syntax__menu${docked ? ' task-syntax__menu--docked' : ''}`}
        data-task-date-menu=""
        hidden={!open}
        style={docked ? undefined : style}
      >
        <p className="task-syntax__heading" id={ids.heading}>
          {kind === 'due' ? 'Deadline…' : 'Show this task on…'}
        </p>
        <ul
          className="task-syntax__options"
          role="listbox"
          id={ids.listbox}
          aria-labelledby={ids.heading}
        >
          {open && !picker
            ? items.map((item, i) => (
                <li
                  key={item.id}
                  id={ids.option(item.id)}
                  role="option"
                  aria-label={
                    item.detail ? `${item.label}, ${item.detail}` : item.label
                  }
                  aria-selected={i === activeIndex}
                  className={`task-syntax__option${item.id === 'deadline' ? ' task-syntax__option--section' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => onActivate(i)}
                  onClick={() => onChoose(item)}
                >
                  <span>{item.label}</span>
                  {item.detail ? (
                    <span className="task-syntax__detail">{item.detail}</span>
                  ) : null}
                </li>
              ))
            : null}
        </ul>
        {picker ? (
          <div className="task-syntax__picker">
            <label>
              <span>Pick a date</span>
              <input
                ref={pickerRef}
                type="date"
                className="admin-input"
                value={picker.value}
                onChange={(e) => picker.onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    picker.onSet();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    picker.onCancel();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="admin-btn"
              disabled={!picker.value}
              onClick={picker.onSet}
            >
              Set date
            </button>
          </div>
        ) : null}
        <p className="task-syntax__hint" id={ids.hint}>
          {kind === 'due' ? DUE_HINT : hint}
        </p>
      </div>
      <p className="task-syntax__status" role="status" aria-live="polite">
        {open && !picker
          ? `${items.length} date ${items.length === 1 ? 'option' : 'options'}. Up and down to move, Enter to choose, Escape to close.`
          : ''}
      </p>
    </>
  );
}
