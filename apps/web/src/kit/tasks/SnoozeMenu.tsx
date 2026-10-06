import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { TaskSchedule } from '@gagnechris/shared';
import { TaskDateMenu } from './TaskDateMenu';
import {
  taskDateMenuIds,
  taskDateMenuItems,
  tomorrowOf,
  type TaskDateMenuItem,
} from './taskDateMenuItems';

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
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const items = taskDateMenuItems(baseDay, '', 'start', { deadline: false });
  const activeItem = items[active];

  const close = () => {
    setOpen(false);
    setPicked(null);
    setActive(0);
  };

  const choose = (item: TaskDateMenuItem) => {
    if (!item.schedule) {
      setPicked(tomorrowOf(baseDay));
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
    if (picked !== null || !activeItem) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + items.length) % items.length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : items.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(activeItem);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
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
          open && picked === null && activeItem
            ? ids.option(activeItem.id)
            : undefined
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
        onActivate={setActive}
        hint="Hides it until that day. It comes back to Still open then."
        picker={
          picked !== null
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
                  setPicked(null);
                  triggerRef.current?.focus();
                },
              }
            : null
        }
      />
    </span>
  );
}
