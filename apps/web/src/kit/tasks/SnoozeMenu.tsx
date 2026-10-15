import type { TaskSchedule } from '@gagnechris/shared';
import { Button, IconButton } from '@gagnechris/ui';
import { TaskDateButton } from './TaskDateButton';

const chevron = (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path
      d="M4 6l4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);

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
  const name = `Snooze ${title} to another day`;
  return (
    <TaskDateButton
      kind="start"
      baseDay={baseDay}
      onChoose={onChoose}
      hint="Hides it until that day. It comes back to Still open then."
      disabled={disabled}
      up={Boolean(label)}
      trigger={(props) =>
        label ? (
          <Button {...props} aria-label={name} title="Snooze to another day">
            {label}
            {chevron}
          </Button>
        ) : (
          <IconButton
            {...props}
            size="sm"
            label={name}
            title="Snooze to another day"
          >
            {chevron}
          </IconButton>
        )
      }
    />
  );
}
