import { taskDateMenuItems, type TaskSchedule } from '@gagnechris/shared';
import { ActionSheetIOS } from 'react-native';

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
      const items = taskDateMenuItems(snoozeFrom, '', 'start', {
        deadline: false,
      });
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Show this task on',
          options: [
            ...items.map((item) =>
              item.detail ? `${item.label} · ${item.detail}` : item.label,
            ),
            'Cancel',
          ],
          cancelButtonIndex: items.length,
        },
        (choice) => {
          const item = items[choice];
          if (!item) return;
          if (item.schedule) onSnooze(item.schedule);
          else onPickDate();
        },
      );
    },
  );
