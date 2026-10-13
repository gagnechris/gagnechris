import {
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  activeTaskDateIndex,
  CLOSED_TASK_DATE_MENU,
  taskDateMenuIds,
  type TaskDateKind,
  type TaskDateMenuItem,
  taskDateMenuItems,
  taskDateMenuKey,
  taskDateMenuReducer,
  type TaskSchedule,
  tomorrowOf,
} from '@gagnechris/shared';
import { TaskDateMenu } from './TaskDateMenu';
import './todayPanels.css';

const PICK_RANGE = { from: 0, to: 0, kind: 'start' } as const;

type Props = {
  kind: TaskDateKind;
  /** Local day the options resolve from. */
  baseDay: string;
  /** For a deadline, `startDate` is the deadline. */
  onChoose: (schedule: TaskSchedule) => void;
  /** Adds a last option that clears the date. */
  clearLabel?: string;
  hint: string;
  disabled?: boolean;
  className: string;
  ariaLabel: string;
  title?: string;
  children: ReactNode;
  /** Opens the menu upward, for a bar at the bottom of the screen. */
  up?: boolean;
};

/** A select-only combobox: the trigger keeps focus and owns the keys. */
export function TaskDateButton({
  kind,
  baseDay,
  onChoose,
  clearLabel,
  hint,
  disabled,
  className,
  ariaLabel,
  title,
  children,
  up,
}: Props) {
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
  const items: TaskDateMenuItem[] = [
    ...taskDateMenuItems(baseDay, '', kind, { deadline: false }),
    ...(clearLabel
      ? [
          {
            id: 'clear',
            label: clearLabel,
            detail: '',
            token: null,
            schedule: { startDate: null, someday: false },
          },
        ]
      : []),
  ];
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
      className={up ? 'today-snooze today-snooze--up' : 'today-snooze'}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={className}
        aria-label={ariaLabel}
        title={title}
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
        {children}
      </button>
      <TaskDateMenu
        baseId={baseId}
        open={open}
        kind={kind}
        items={items}
        activeIndex={active}
        onChoose={choose}
        onActivate={(index) => dispatch({ type: 'activate', index })}
        hint={hint}
        picker={
          picking
            ? {
                value: picked,
                onChange: setPicked,
                onSet: () => {
                  const date = picked;
                  close();
                  triggerRef.current?.focus();
                  if (date) onChoose({ startDate: date, someday: false });
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
