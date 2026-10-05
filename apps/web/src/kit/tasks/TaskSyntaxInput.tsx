import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import {
  activeTaskDateQuery,
  matchesTaskDateQuery,
  resolveTaskDateToken,
  taskDateMenuOptions,
  taskDateToken,
} from '@gagnechris/shared';
import './taskSyntax.css';

type MenuOption = {
  id: string;
  label: string;
  detail: string;
  token: string | null;
};

const PICK_KEYWORDS = ['pick a date', 'date'];

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'role' | 'type'
> & {
  value: string;
  onChange: (value: string) => void;
  /** Local `yyyy-mm-dd` the menu resolves dates from. */
  today: string;
  hint?: string;
};

/** A text input that offers task date tokens when an `@` is typed. */
export function TaskSyntaxInput({
  value,
  onChange,
  today,
  hint = 'Shows up on Today from that date.',
  className,
  onKeyDown,
  onBlur,
  ...inputProps
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const headingId = `${baseId}-heading`;
  const hintId = `${baseId}-hint`;

  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  // The `@` position whose menu was closed with Esc stays closed.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [picking, setPicking] = useState<{ from: number; to: number } | null>(
    null,
  );
  const [picked, setPicked] = useState('');
  // A fresh object per insert, so the same caret position re-runs the effect.
  const [placeCaret, setPlaceCaret] = useState<{ at: number } | null>(null);

  const typed = caret === null ? null : activeTaskDateQuery(value, caret);
  // A finished token needs no menu, so Enter still submits `Call @mon`.
  const query =
    typed && !resolveTaskDateToken(typed.query, today) ? typed : null;
  const options: MenuOption[] = query
    ? [
        ...taskDateMenuOptions(today).filter((o) =>
          matchesTaskDateQuery(o.keywords, query.query),
        ),
        ...(matchesTaskDateQuery(PICK_KEYWORDS, query.query)
          ? [{ id: 'pick', label: 'Pick a date…', detail: '', token: null }]
          : []),
      ]
    : [];
  const open =
    picking !== null ||
    (query !== null && query.from !== dismissedAt && options.length > 0);
  const activeIndex = Math.min(active, options.length - 1);
  const activeOption = options[activeIndex];
  const optionId = (id: string) => `${baseId}-option-${id}`;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!placeCaret || !input) return;
    input.focus();
    input.setSelectionRange(placeCaret.at, placeCaret.at);
  }, [placeCaret]);

  const syncCaret = () => {
    const input = inputRef.current;
    if (input) setCaret(input.selectionStart);
  };

  const insert = (range: { from: number; to: number }, token: string) => {
    const after = value.slice(range.to).replace(/^\s+/, '');
    const next = `${value.slice(0, range.from)}${token} ${after}`;
    const at = range.from + token.length + 1;
    setCaret(at);
    setPlaceCaret({ at });
    setPicking(null);
    setActive(0);
    onChange(next);
  };

  const choose = (option: MenuOption) => {
    if (!query) return;
    if (option.token) {
      insert(query, option.token);
      return;
    }
    setPicking({ from: query.from, to: query.to });
    setPicked(resolveTaskDateToken('tomorrow', today)?.startDate ?? today);
  };

  useLayoutEffect(() => {
    if (picking) pickerRef.current?.focus();
  }, [picking]);

  const setPickedDate = () => {
    if (picking && picked) insert(picking, taskDateToken(picked, today));
  };

  const cancelPicking = () => {
    if (!picking) return;
    setDismissedAt(picking.from);
    setCaret(picking.to);
    setPlaceCaret({ at: picking.to });
    setPicking(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && !picking && activeOption) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + options.length) % options.length);
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setActive(e.key === 'Home' ? 0 : options.length - 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        choose(activeOption);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDismissedAt(query?.from ?? null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div
      className="task-syntax"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setPicking(null);
        setCaret(null);
      }}
    >
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        role="combobox"
        className={className ?? 'admin-input'}
        value={value}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-describedby={open ? hintId : inputProps['aria-describedby']}
        aria-activedescendant={
          open && !picking && activeOption
            ? optionId(activeOption.id)
            : undefined
        }
        onChange={(e) => {
          setCaret(e.target.selectionStart);
          setActive(0);
          setDismissedAt(null);
          onChange(e.target.value);
        }}
        onSelect={syncCaret}
        onFocus={syncCaret}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
      />
      <div className="task-syntax__menu" hidden={!open}>
        <p className="task-syntax__heading" id={headingId}>
          Show this task on…
        </p>
        <ul
          className="task-syntax__options"
          role="listbox"
          id={listboxId}
          aria-labelledby={headingId}
        >
          {open && !picking
            ? options.map((option, i) => (
                <li
                  key={option.id}
                  id={optionId(option.id)}
                  role="option"
                  aria-label={
                    option.detail
                      ? `${option.label}, ${option.detail}`
                      : option.label
                  }
                  aria-selected={i === activeIndex}
                  className="task-syntax__option"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {option.detail ? (
                    <span className="task-syntax__detail">{option.detail}</span>
                  ) : null}
                </li>
              ))
            : null}
        </ul>
        {picking ? (
          <div className="task-syntax__picker">
            <label>
              <span>Pick a date</span>
              <input
                ref={pickerRef}
                type="date"
                className="admin-input"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setPickedDate();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelPicking();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="admin-btn"
              disabled={!picked}
              onClick={setPickedDate}
            >
              Set date
            </button>
          </div>
        ) : null}
        <p className="task-syntax__hint" id={hintId}>
          {hint}
        </p>
      </div>
      <p className="task-syntax__status" role="status" aria-live="polite">
        {open && !picking
          ? `${options.length} date ${options.length === 1 ? 'option' : 'options'}. Up and down to move, Enter to choose, Escape to close.`
          : ''}
      </p>
    </div>
  );
}
