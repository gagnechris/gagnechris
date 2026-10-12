import type { TaskDraft } from '@gagnechris/app-core';
import type { TaskSchedule } from '@gagnechris/shared';
import { useState } from 'react';
import { PickDateModal } from '../PickDateModal';
import { showTaskDates } from '../taskActionSheets';

type DatePick = 'start' | 'due' | null;

type Options = {
  draft: TaskDraft;
  today: string;
  setField: (change: Partial<TaskDraft>) => void;
};

/** The Shows on and Deadline sheets and their "Pick a date…" calendar. */
export function useTaskDates({ draft, today, setField }: Options) {
  const [picking, setPicking] = useState<DatePick>(null);

  const schedule = ({ startDate, someday }: TaskSchedule) =>
    setField({ startDate: startDate ?? '', someday });

  const pickShowsOn = (title: string) =>
    showTaskDates({
      title,
      from: today,
      extra: [
        {
          label: 'Today',
          run: () => schedule({ startDate: null, someday: false }),
        },
      ],
      onSchedule: schedule,
      onPickDate: () => setPicking('start'),
    });

  const pickDeadline = () =>
    showTaskDates({
      title: 'Deadline',
      from: today,
      kind: 'due',
      extra: draft.dueDate
        ? [{ label: 'No deadline', run: () => setField({ dueDate: '' }) }]
        : [],
      onSchedule: ({ startDate }) => setField({ dueDate: startDate ?? '' }),
      onPickDate: () => setPicking('due'),
    });

  const datePicker = (
    <PickDateModal
      key={picking ?? 'none'}
      title={
        picking === 'start'
          ? 'Show this task on'
          : picking === 'due'
            ? 'Deadline'
            : null
      }
      today={(picking === 'due' ? draft.dueDate : draft.startDate) || today}
      onCancel={() => setPicking(null)}
      onDone={(day) => {
        if (picking === 'due') setField({ dueDate: day });
        else schedule({ startDate: day, someday: false });
        setPicking(null);
      }}
    />
  );

  return { pickShowsOn, pickDeadline, datePicker };
}
