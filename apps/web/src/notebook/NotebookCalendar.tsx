import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  addLocalDays,
  localToday,
  monthBounds,
  monthGrid,
  monthLabel,
  parseLocalDate,
  startOfMonth,
} from '../kit/calendarDates';

type Props = {
  selected: string;
  onSelect: (date: string) => void;
  /** Dates (`yyyy-mm-dd`) that have a daily note. */
  markedDates?: ReadonlySet<string>;
};

const WEEKDAYS = [
  ['Su', 'Sunday'],
  ['Mo', 'Monday'],
  ['Tu', 'Tuesday'],
  ['We', 'Wednesday'],
  ['Th', 'Thursday'],
  ['Fr', 'Friday'],
  ['Sa', 'Saturday'],
] as const;

function dayLabel(date: string, marked: boolean): string {
  const label =
    parseLocalDate(date)?.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }) ?? date;
  return marked ? `${label}, has a note` : label;
}

export function NotebookCalendar({ selected, onSelect, markedDates }: Props) {
  const month = startOfMonth(selected);
  const cells = monthGrid(month);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const today = localToday();
  const { to: lastDay } = monthBounds(month);
  const previousMonth = () => onSelect(addLocalDays(month, -1));
  const nextMonth = () => onSelect(addLocalDays(lastDay, 1));

  const [focused, setFocused] = useState<string | null>(null);
  // Arrow keys stay inside the month shown; the selected day is the one tab stop
  // whenever the focused day belongs to another month.
  const active = focused && cells.includes(focused) ? focused : selected;
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
        ? addLocalDays(date, -1)
        : e.key === 'ArrowRight'
          ? addLocalDays(date, 1)
          : e.key === 'ArrowUp'
            ? addLocalDays(date, -7)
            : e.key === 'ArrowDown'
              ? addLocalDays(date, 7)
              : e.key === 'Home'
                ? addLocalDays(date, -column)
                : e.key === 'End'
                  ? addLocalDays(date, 6 - column)
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
      moved.current = true;
      if (e.key === 'PageUp') previousMonth();
      else nextMonth();
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
        <button
          type="button"
          className="admin-btn"
          onClick={previousMonth}
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="notebook-calendar__label" aria-live="polite">
          {monthLabel(month)}
        </span>
        <button
          type="button"
          className="admin-btn"
          onClick={nextMonth}
          aria-label="Next month"
        >
          →
        </button>
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
