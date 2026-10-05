import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { taskDateMenuIds, type TaskDateMenuItem } from './taskDateMenuItems';
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
  items: TaskDateMenuItem[];
  activeIndex: number;
  onChoose: (item: TaskDateMenuItem) => void;
  onActivate: (index: number) => void;
  /** Set while Pick a date… asks for the day. */
  picker: Picker | null;
  hint: string;
  style?: CSSProperties;
};

/** The `@` date menu; the field that owns the caret handles the keys. */
export function TaskDateMenu({
  baseId,
  open,
  items,
  activeIndex,
  onChoose,
  onActivate,
  picker,
  hint,
  style,
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
        className="task-syntax__menu"
        data-task-date-menu=""
        hidden={!open}
        style={style}
      >
        <p className="task-syntax__heading" id={ids.heading}>
          Show this task on…
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
                  className="task-syntax__option"
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
          {hint}
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
