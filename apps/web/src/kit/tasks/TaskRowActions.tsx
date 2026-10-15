import {
  formatTaskDay,
  nextWeekday,
  type TaskSchedule,
} from '@gagnechris/shared';
import { IconButton } from '@gagnechris/ui';
import { SnoozeMenu } from './SnoozeMenu';
import './todayPanels.css';

type Props = {
  title: string;
  /** Local day Snooze counts from. */
  snoozeFrom: string;
  onSnooze: (schedule: TaskSchedule) => void;
  /** Without it there is no Drop button. */
  onDrop?: () => void;
};

/** Snooze to Monday, Snooze to another day, and Drop. */
export function TaskRowActions({ title, snoozeFrom, onSnooze, onDrop }: Props) {
  const monday = nextWeekday(snoozeFrom, 1);
  const mondayLabel = formatTaskDay(monday);
  return (
    <>
      <IconButton
        size="sm"
        label={`Snooze ${title} to ${mondayLabel}`}
        title={`Snooze to ${mondayLabel}`}
        onClick={() => onSnooze({ startDate: monday, someday: false })}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle
            cx="8"
            cy="9"
            r="5.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M8 6.5V9l1.75 1.25M2.5 3.5l2-1.5M13.5 3.5l-2-1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </IconButton>
      <SnoozeMenu title={title} baseDay={snoozeFrom} onChoose={onSnooze} />
      {onDrop ? (
        <IconButton
          size="sm"
          label={`Drop ${title}`}
          title="Drop: close without doing it"
          onClick={onDrop}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      ) : null}
    </>
  );
}
