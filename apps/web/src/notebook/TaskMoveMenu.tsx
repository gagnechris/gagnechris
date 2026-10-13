import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { taskDateMenuItems, tomorrowOf } from '@gagnechris/shared';

type Props = {
  sections: readonly string[];
  /** Local day the date options count from. */
  today: string;
  /** The note's own day, left out of the days. */
  noteDate?: string | null;
  onSection: (index: number) => void;
  onDay: (date: string) => void;
  onClose: () => void;
};

/** Move to…: one of the note's sections, or another day's note. */
export function TaskMoveMenu({
  sections,
  today,
  noteDate,
  onSection,
  onDay,
  onClose,
}: Props) {
  const [days, setDays] = useState(false);
  const [picked, setPicked] = useState(() => tomorrowOf(today));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [days]);

  const dayItems = taskDateMenuItems(today, '', 'start', {
    deadline: false,
  }).filter(
    (item) =>
      item.schedule &&
      !item.schedule.someday &&
      item.schedule.startDate !== noteDate,
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      items[
        (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      ];
    e.preventDefault();
    next?.focus();
  };

  return (
    <div
      ref={ref}
      className="task-move-menu"
      role="menu"
      aria-label={days ? 'Move to another day’s note' : 'Move to'}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onClose();
        }
      }}
    >
      {days ? (
        <>
          {dayItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="task-move-menu__item"
              onClick={() => onDay(item.schedule!.startDate!)}
            >
              <span>{item.label}</span>
              <span className="task-move-menu__detail">{item.detail}</span>
            </button>
          ))}
          <form
            className="task-move-menu__pick"
            onSubmit={(e) => {
              e.preventDefault();
              if (picked && picked !== noteDate) onDay(picked);
            }}
          >
            <label>
              <span>Pick a date</span>
              <input
                type="date"
                className="kit-input"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="kit-btn"
              disabled={!picked || picked === noteDate}
            >
              Move
            </button>
          </form>
        </>
      ) : (
        <>
          {sections.length > 0 ? (
            <p className="task-move-menu__heading">Sections</p>
          ) : null}
          {sections.map((title, i) => (
            <button
              key={`${i}-${title}`}
              type="button"
              role="menuitem"
              className="task-move-menu__item"
              onClick={() => onSection(i)}
            >
              {title}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="task-move-menu__item task-move-menu__item--days"
            onClick={() => setDays(true)}
          >
            Another day’s note…
          </button>
        </>
      )}
    </div>
  );
}
