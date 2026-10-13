import type { TaskSchedule } from '@gagnechris/shared';
import { TaskDateButton } from './TaskDateButton';

type Props = {
  title: string;
  /** Local day the options resolve from. */
  baseDay: string;
  onChoose: (schedule: TaskSchedule) => void;
  disabled?: boolean;
  /** A text button that opens the menu upward, for a bar at the bottom of the screen. */
  label?: string;
};

export function SnoozeMenu({
  title,
  baseDay,
  onChoose,
  disabled,
  label,
}: Props) {
  return (
    <TaskDateButton
      kind="start"
      baseDay={baseDay}
      onChoose={onChoose}
      hint="Hides it until that day. It comes back to Still open then."
      disabled={disabled}
      className={
        label ? 'kit-btn' : 'today-row__icon-btn today-row__icon-btn--more'
      }
      ariaLabel={`Snooze ${title} to another day`}
      title="Snooze to another day"
      up={Boolean(label)}
    >
      {label}
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    </TaskDateButton>
  );
}
