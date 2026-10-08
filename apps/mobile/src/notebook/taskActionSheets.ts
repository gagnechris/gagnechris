import {
  taskDateMenuItems,
  type TaskDateKind,
  type TaskSchedule,
} from '@gagnechris/shared';
import { ActionSheetIOS } from 'react-native';

/** The shared date items as a sheet; Pick a date… calls `onPickDate`. */
export const showTaskDates = ({
  title,
  from,
  kind = 'start',
  extra = [],
  onSchedule,
  onPickDate,
}: {
  title: string;
  /** The day the options count from. */
  from: string;
  kind?: TaskDateKind;
  /** Options after the dates, such as No date. */
  extra?: { label: string; run: () => void }[];
  onSchedule: (schedule: TaskSchedule) => void;
  onPickDate: () => void;
}) => {
  const items = taskDateMenuItems(from, '', kind, { deadline: false });
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [
        ...items.map((item) =>
          item.detail ? `${item.label} · ${item.detail}` : item.label,
        ),
        ...extra.map((e) => e.label),
        'Cancel',
      ],
      cancelButtonIndex: items.length + extra.length,
    },
    (choice) => {
      const item = items[choice];
      if (!item) {
        extra[choice - items.length]?.run();
        return;
      }
      if (item.schedule) onSchedule(item.schedule);
      else onPickDate();
    },
  );
};

/** ⋯ on a Still open row: Snooze (then the shared date items) or Drop. */
export const showSnoozeOrDrop = ({
  title,
  snoozeFrom,
  onSnooze,
  onPickDate,
  onDrop,
}: {
  title: string;
  /** The day Snooze's options count from. */
  snoozeFrom: string;
  onSnooze: (schedule: TaskSchedule) => void;
  onPickDate: () => void;
  onDrop: () => void;
}) =>
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: ['Snooze…', 'Drop', 'Cancel'],
      destructiveButtonIndex: 1,
      cancelButtonIndex: 2,
    },
    (index) => {
      if (index === 1) onDrop();
      if (index !== 0) return;
      showTaskDates({
        title: 'Show this task on',
        from: snoozeFrom,
        onSchedule: onSnooze,
        onPickDate,
      });
    },
  );

/** One choice from a short list, as an action sheet. */
export const showChoice = <T extends string>({
  title,
  options,
  labels,
  onChoose,
}: {
  title: string;
  options: readonly T[];
  labels: Record<T, string>;
  onChoose: (value: T) => void;
}) =>
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...options.map((o) => labels[o]), 'Cancel'],
      cancelButtonIndex: options.length,
    },
    (index) => {
      const value = options[index];
      if (value !== undefined) onChoose(value);
    },
  );
