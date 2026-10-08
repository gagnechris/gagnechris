import {
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import {
  activeTaskDateIndex,
  CLOSED_TASK_DATE_MENU,
  openTaskDateQuery,
  taskDateMenuIds,
  taskDateMenuIsOpen,
  type TaskDateMenuItem,
  taskDateMenuItems,
  taskDateMenuKey,
  taskDateMenuReducer,
  taskDateToken,
  tokenInsertion,
  tomorrowOf,
} from '@gagnechris/shared';
import { TaskDateMenu } from './TaskDateMenu';
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

/** A text input that offers task date tokens when `@` or `due:` is typed. */
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
  const [menu, dispatch] = useReducer(
    taskDateMenuReducer,
    CLOSED_TASK_DATE_MENU,
  );
  const { picking } = menu;
  const [picked, setPicked] = useState('');
  // A fresh object per insert, so the same caret position re-runs the effect.
  const [placeCaret, setPlaceCaret] = useState<{ at: number } | null>(null);

  const query = caret === null ? null : openTaskDateQuery(value, caret, today);
  const items = query ? taskDateMenuItems(today, query.query, query.kind) : [];
  const open = taskDateMenuIsOpen(menu, query?.from ?? null);
  const activeIndex = activeTaskDateIndex(menu, items.length);
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
    const change = tokenInsertion(range, token, value.slice(range.to));
    const next = `${value.slice(0, change.from)}${change.insert}${value.slice(change.to)}`;
    setCaret(change.caret);
    setPlaceCaret({ at: change.caret });
    dispatch({ type: 'close-picker' });
    onChange(next);
  };

  const choose = (item: TaskDateMenuItem) => {
    if (!query) return;
    if (item.token) {
      insert(query, item.token);
      return;
    }
    dispatch({
      type: 'pick',
      range: { from: query.from, to: query.to, kind: query.kind },
    });
    setPicked(tomorrowOf(today));
  };

  const setPickedDate = () => {
    if (picking && picked) {
      insert(
        picking,
        taskDateToken(picked, today, picking.kind === 'due' ? 'due:' : '@'),
      );
    }
  };

  const cancelPicking = () => {
    if (!picking) return;
    setCaret(picking.to);
    setPlaceCaret({ at: picking.to });
    dispatch({ type: 'cancel-pick' });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const action =
      open && !picking && activeItem
        ? taskDateMenuKey(e.key, items.length)
        : null;
    if (action) {
      e.preventDefault();
      if (action === 'choose') choose(activeItem!);
      else if (action === 'dismiss') {
        e.stopPropagation();
        dispatch({ type: 'dismiss', at: query?.from ?? null });
      } else dispatch(action);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div
      className="task-syntax"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        dispatch({ type: 'close-picker' });
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
          dispatch({ type: 'typed' });
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
        kind={picking?.kind ?? query?.kind ?? 'start'}
        items={items}
        activeIndex={activeIndex}
        onChoose={choose}
        onActivate={(index) => dispatch({ type: 'activate', index })}
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
