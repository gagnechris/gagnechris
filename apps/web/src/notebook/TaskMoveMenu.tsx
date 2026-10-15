import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { taskDateMenuItems, tomorrowOf } from '@gagnechris/shared';
import {
  Button,
  DateInput,
  MenuGroup,
  MenuItem,
  MenuSeparator,
} from '@gagnechris/ui';

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
      className="ui-menu task-move-menu"
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
            <MenuItem
              key={item.id}
              onSelect={() => onDay(item.schedule!.startDate!)}
            >
              {item.label}{' '}
              <span className="task-move-menu__detail">{item.detail}</span>
            </MenuItem>
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
              <DateInput
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={!picked || picked === noteDate}>
              Move
            </Button>
          </form>
        </>
      ) : (
        <>
          {sections.length > 0 ? (
            <MenuGroup label="Sections">
              {sections.map((title, i) => (
                <MenuItem key={`${i}-${title}`} onSelect={() => onSection(i)}>
                  {title}
                </MenuItem>
              ))}
            </MenuGroup>
          ) : null}
          {sections.length > 0 ? <MenuSeparator /> : null}
          <MenuItem onSelect={() => setDays(true)}>
            Another day’s note…
          </MenuItem>
        </>
      )}
    </div>
  );
}
