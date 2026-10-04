import {
  addLocalDays,
  localToday,
  monthBounds,
  monthGrid,
  monthLabel,
  startOfMonth,
} from '../kit/calendarDates';

type Props = {
  selected: string;
  onSelect: (date: string) => void;
  /** Dates (`yyyy-mm-dd`) that have a daily note. */
  markedDates?: ReadonlySet<string>;
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function NotebookCalendar({ selected, onSelect, markedDates }: Props) {
  const month = startOfMonth(selected);
  const cells = monthGrid(month);
  const today = localToday();

  return (
    <div className="notebook-calendar">
      <div className="notebook-calendar__toolbar">
        <button
          type="button"
          className="admin-btn"
          onClick={() => onSelect(addLocalDays(startOfMonth(month), -1))}
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="notebook-calendar__label">{monthLabel(month)}</span>
        <button
          type="button"
          className="admin-btn"
          onClick={() => {
            const { to } = monthBounds(month);
            onSelect(addLocalDays(to, 1));
          }}
          aria-label="Next month"
        >
          →
        </button>
      </div>
      <div className="notebook-calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div
        className="notebook-calendar__grid"
        role="grid"
        aria-label="Calendar"
      >
        {cells.map((date, index) => {
          if (!date) {
            return (
              <span
                key={`pad-${index}`}
                className="notebook-calendar__cell notebook-calendar__cell--empty"
              />
            );
          }
          const marked = markedDates?.has(date) ?? false;
          const isSelected = date === selected;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              className={[
                'notebook-calendar__cell',
                isSelected ? 'notebook-calendar__cell--selected' : '',
                isToday ? 'notebook-calendar__cell--today' : '',
                marked ? 'notebook-calendar__cell--marked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onSelect(date)}
            >
              <span>{Number(date.slice(-2))}</span>
              {marked ? (
                <span className="notebook-calendar__dot" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
