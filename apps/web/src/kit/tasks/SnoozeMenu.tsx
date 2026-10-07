import { useId, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import {
  activeTaskDateIndex,
  CLOSED_TASK_DATE_MENU,
  taskDateMenuIds,
  type TaskDateMenuItem,
  taskDateMenuItems,
  taskDateMenuKey,
  taskDateMenuReducer,
  type TaskSchedule,
  tomorrowOf,
} from '@gagnechris/shared';
import { TaskDateMenu } from './TaskDateMenu';

const PICK_RANGE = { from: 0, to: 0, kind: 'start' } as const;

type Props = {
  title: string;
  /** Local day the options resolve from. */
  baseDay: string;
  onChoose: (schedule: TaskSchedule) => void;
  disabled?: boolean;
};

/** A select-only combobox: the trigger keeps focus and owns the keys. */
export function SnoozeMenu({ title, baseDay, onChoose, disabled }: Props) {
  const baseId = useId();
  const ids = taskDateMenuIds(baseId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menu, dispatch] = useReducer(
    taskDateMenuReducer,
    CLOSED_TASK_DATE_MENU,
  );
  const [picked, setPicked] = useState('');
  const picking = menu.picking !== null;
  const items = taskDateMenuItems(baseDay, '', 'start', { deadline: false });
  const active = activeTaskDateIndex(menu, items.length);
  const activeItem = items[active];

  const close = () => {
    setOpen(false);
    dispatch({ type: 'reset' });
  };

  const choose = (item: TaskDateMenuItem) => {
    if (!item.schedule) {
      setPicked(tomorrowOf(baseDay));
      dispatch({ type: 'pick', range: PICK_RANGE });
      return;
    }
    close();
    onChoose(item.schedule);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (picking || !activeItem) return;
    const action = taskDateMenuKey(e.key, items.length, {
      chooseWithSpace: true,
    });
    if (!action) return;
    e.preventDefault();
    if (action === 'choose') choose(activeItem);
    else if (action === 'dismiss') {
      e.stopPropagation();
      close();
    } else dispatch(action);
  };

  return (
    <span
      className="today-snooze"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="today-row__icon-btn today-row__icon-btn--more"
        aria-label={`Snooze ${title} to another day`}
        title="Snooze to another day"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={ids.listbox}
        aria-activedescendant={
          open && !picking && activeItem ? ids.option(activeItem.id) : undefined
        }
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      </button>
      <TaskDateMenu
        baseId={baseId}
        open={open}
        kind="start"
        items={items}
        activeIndex={active}
        onChoose={choose}
        onActivate={(index) => dispatch({ type: 'activate', index })}
        hint="Hides it until that day. It comes back to Still open then."
        picker={
          picking
            ? {
                value: picked,
                onChange: setPicked,
                onSet: () => {
                  const startDate = picked;
                  close();
                  triggerRef.current?.focus();
                  if (startDate) onChoose({ startDate, someday: false });
                },
                onCancel: () => {
                  dispatch({ type: 'close-picker' });
                  triggerRef.current?.focus();
                },
              }
            : null
        }
      />
    </span>
  );
}
