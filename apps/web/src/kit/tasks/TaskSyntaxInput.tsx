import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { taskDateToken } from '@gagnechris/shared';
import { TaskDateMenu } from './TaskDateMenu';
import {
  openTaskDateQuery,
  taskDateMenuIds,
  taskDateMenuItems,
  tomorrowOf,
  type TaskDateMenuItem,
} from './taskDateMenuItems';
import './taskSyntax.css';

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
  const baseId = useId();
  const ids = taskDateMenuIds(baseId);

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

  const query = caret === null ? null : openTaskDateQuery(value, caret, today);
  const items = query ? taskDateMenuItems(today, query.query) : [];
  const open =
    picking !== null || (query !== null && query.from !== dismissedAt);
  const activeIndex = Math.min(active, items.length - 1);
  const activeItem = items[activeIndex];

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

  const choose = (item: TaskDateMenuItem) => {
    if (!query) return;
    if (item.token) {
      insert(query, item.token);
      return;
    }
    setPicking({ from: query.from, to: query.to });
    setPicked(tomorrowOf(today));
  };

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
    if (open && !picking && activeItem) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + items.length) % items.length);
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setActive(e.key === 'Home' ? 0 : items.length - 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        choose(activeItem);
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
        aria-controls={ids.listbox}
        aria-describedby={open ? ids.hint : inputProps['aria-describedby']}
        aria-activedescendant={
          open && !picking && activeItem ? ids.option(activeItem.id) : undefined
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
      <TaskDateMenu
        baseId={baseId}
        open={open}
        items={items}
        activeIndex={activeIndex}
        onChoose={choose}
        onActivate={setActive}
        hint={hint}
        picker={
          picking
            ? {
                value: picked,
                onChange: setPicked,
                onSet: setPickedDate,
                onCancel: cancelPicking,
              }
            : null
        }
      />
    </div>
  );
}
