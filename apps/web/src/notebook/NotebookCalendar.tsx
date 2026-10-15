import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, formatCalendarDay, WEEKDAY_LONG } from '@gagnechris/shared';
import { IconButton } from '@gagnechris/ui';
import {
  monthBounds,
  monthGrid,
  monthLabel,
  startOfMonth,
} from '../kit/calendarDates';
import ShellIcon from '../workspace/ui/ShellIcon';
import { useLocalToday } from './useLocalToday';

type Props = {
  selected: string;
  onSelect: (date: string) => void;
  /** Dates (`yyyy-mm-dd`) that have a daily note. */
  markedDates?: ReadonlySet<string>;
  /** The first day of the month shown, whenever it changes. */
  onMonthChange?: (month: string) => void;
};

const WEEKDAYS = WEEKDAY_LONG.map((long) => [long.slice(0, 2), long] as const);

function dayLabel(date: string, marked: boolean): string {
  const label = formatCalendarDay(date, {
    weekday: 'long',
    month: 'long',
    year: true,
  });
  return marked ? `${label}, has a note` : label;
}

/** The same day of the month in `month`, or its last day if shorter. */
function sameDayIn(month: string, date: string): string {
  const { to } = monthBounds(month);
  const day = `${month.slice(0, 8)}${date.slice(-2)}`;
  return day > to ? to : day;
}

export function NotebookCalendar({
  selected,
  onSelect,
  markedDates,
  onMonthChange,
}: Props) {
  // Browsing months only changes what's shown; choosing a day selects it.
  const [month, setMonth] = useState(() => startOfMonth(selected));
  const [shownFor, setShownFor] = useState(selected);
  if (shownFor !== selected) {
    setShownFor(selected);
    setMonth(startOfMonth(selected));
  }
  useEffect(() => {
    onMonthChange?.(month);
  }, [month, onMonthChange]);
  const cells = monthGrid(month);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const today = useLocalToday();
  const { to: lastDay } = monthBounds(month);
  const previousMonth = () => setMonth(startOfMonth(addDays(month, -1)));
  const nextMonth = () => setMonth(addDays(lastDay, 1));

  const [focused, setFocused] = useState<string | null>(null);
  // Arrow keys stay inside the month shown. The one tab stop is the focused
  // day, else the selected day, else the month's first day.
  const active =
    focused && cells.includes(focused)
      ? focused
      : cells.includes(selected)
        ? selected
        : month;
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    cellRefs.current.get(active)?.focus();
  }, [active]);

  const onKeyDown = (e: KeyboardEvent, date: string) => {
    const column = cells.indexOf(date) % 7;
    const target =
      e.key === 'ArrowLeft'
        ? addDays(date, -1)
        : e.key === 'ArrowRight'
          ? addDays(date, 1)
          : e.key === 'ArrowUp'
            ? addDays(date, -7)
            : e.key === 'ArrowDown'
              ? addDays(date, 7)
              : e.key === 'Home'
                ? addDays(date, -column)
                : e.key === 'End'
                  ? addDays(date, 6 - column)
                  : null;
    if (target !== null) {
      e.preventDefault();
      const inMonth = target.slice(0, 7) === month.slice(0, 7);
      const clamped = inMonth ? target : target < date ? month : lastDay;
      moved.current = true;
      setFocused(clamped);
      return;
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const next =
        e.key === 'PageUp'
          ? startOfMonth(addDays(month, -1))
          : addDays(lastDay, 1);
      setMonth(next);
      moved.current = true;
      setFocused(sameDayIn(next, date));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(date);
    }
  };

  return (
    <div className="notebook-calendar">
      <div className="notebook-calendar__toolbar">
        <IconButton
          variant="outline"
          label="Previous month"
          onClick={previousMonth}
        >
          <ShellIcon name="arrowLeft" />
        </IconButton>
        <span className="notebook-calendar__label" aria-live="polite">
          {monthLabel(month)}
        </span>
        <IconButton variant="outline" label="Next month" onClick={nextMonth}>
          <ShellIcon name="arrowRight" />
        </IconButton>
      </div>
      <div
        className="notebook-calendar__grid"
        role="grid"
        aria-label={monthLabel(month)}
      >
        <div className="notebook-calendar__row" role="row">
          {WEEKDAYS.map(([short, long]) => (
            <span
              key={short}
              className="notebook-calendar__weekday"
              role="columnheader"
              aria-label={long}
            >
              {short}
            </span>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="notebook-calendar__row" role="row">
            {row.map((date, index) => {
              if (!date) {
                return (
                  <span
                    key={`pad-${index}`}
                    role="gridcell"
                    className="notebook-calendar__cell notebook-calendar__cell--empty"
                  />
                );
              }
              const marked = markedDates?.has(date) ?? false;
              const isSelected = date === selected;
              const isToday = date === today;
              return (
                <div
                  key={date}
                  ref={(el) => {
                    if (el) cellRefs.current.set(date, el);
                    else cellRefs.current.delete(date);
                  }}
                  role="gridcell"
                  tabIndex={date === active ? 0 : -1}
                  className={[
                    'notebook-calendar__cell',
                    isSelected ? 'notebook-calendar__cell--selected' : '',
                    isToday ? 'notebook-calendar__cell--today' : '',
                    marked ? 'notebook-calendar__cell--marked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={dayLabel(date, marked)}
                  aria-selected={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => onSelect(date)}
                  onKeyDown={(e) => onKeyDown(e, date)}
                  onFocus={() => setFocused(date)}
                >
                  <span aria-hidden="true">{Number(date.slice(-2))}</span>
                  {marked ? (
                    <span
                      className="notebook-calendar__dot"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
