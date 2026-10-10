import {
  useLoadAllPages,
  useNotesByIds,
  useTaskPatch,
  useTasksQuery,
  useTaskToggle,
  type Task,
} from '@gagnechris/app-core';
import {
  areaQueryParam,
  formatTaskDay,
  groupUpcomingTasks,
  NOTEBOOK_AREA_FILTERS,
  NOTEBOOK_AREA_LABELS,
  noteChipLabel,
  taskDue,
  type TaskLineDraft,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text } from 'react-native';
import { useArea } from '../../../src/area';
import { useDetailRoutes } from '../../../src/notebook/detailRoutes';
import { QuickAddTask } from '../../../src/notebook/QuickAddTask';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { color, font } from '../../../src/theme';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';
import { TaskRow } from '../../../src/ui/TaskRow';

const UpcomingScreen = () => {
  const { openTask, openNote } = useDetailRoutes();
  const { area, setArea } = useArea();
  const today = useLocalToday();
  const [refreshing, setRefreshing] = useState(false);

  const scheduled = useTasksQuery({
    area: areaQueryParam(area),
    open: true,
    startAfter: today,
    today,
    limit: 100,
  });
  const parked = useTasksQuery({
    area: areaQueryParam(area),
    open: true,
    someday: true,
    limit: 100,
  });
  useLoadAllPages(scheduled);
  useLoadAllPages(parked);

  const groups = useMemo(
    () =>
      groupUpcomingTasks(
        [
          ...(scheduled.data?.pages.flatMap((p) => p.items) ?? []),
          ...(parked.data?.pages.flatMap((p) => p.items) ?? []),
        ],
        today,
      ),
    [scheduled.data, parked.data, today],
  );

  const noteIds = useMemo(
    () => [
      ...new Set(
        groups.flatMap((g) =>
          g.tasks.flatMap((t) => (t.noteId ? [t.noteId] : [])),
        ),
      ),
    ],
    [groups],
  );
  const noteResults = useNotesByIds(noteIds);
  const noteFor = (task: Task) => {
    const note = task.noteId
      ? noteResults[noteIds.indexOf(task.noteId)]?.data
      : undefined;
    return note && !note.deleted ? note : undefined;
  };

  const { toggle, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const hintAfterCreate = useCallback(
    (draft: TaskLineDraft) =>
      !draft.someday && (!draft.startDate || draft.startDate <= today)
        ? `“${draft.title}” has no later date, so it shows on Today.`
        : null,
    [today],
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([scheduled.refetch(), parked.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loading =
    scheduled.isPending ||
    parked.isPending ||
    scheduled.hasNextPage ||
    parked.hasNextPage;
  const error = toggleError ?? patchError;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      }
    >
      <Text style={styles.subtitle}>Hidden until their day</Text>
      <SegmentedControl
        label="Area"
        options={NOTEBOOK_AREA_FILTERS}
        labels={NOTEBOOK_AREA_LABELS}
        value={area}
        onChange={setArea}
      />
      <QuickAddTask
        area={area}
        today={today}
        label="Schedule a task"
        placeholder="Renew passport @nov 1"
        hintAfterCreate={hintAfterCreate}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {scheduled.isError || parked.isError ? (
        <Text style={styles.error} accessibilityRole="alert">
          Could not load tasks. Pull to try again.
        </Text>
      ) : loading ? (
        <Text style={styles.subtitle}>Loading tasks…</Text>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nothing scheduled"
          body="Add @mon, @oct 12 or @someday to a task to see it here."
        />
      ) : (
        groups.map((group) => (
          <Section key={group.key} title={`${group.label} · ${group.sub}`}>
            {group.tasks.map((task) => {
              const note = noteFor(task);
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  detail={[
                    group.datedRows && task.startDate
                      ? formatTaskDay(task.startDate)
                      : '',
                    note ? noteChipLabel(note) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  due={taskDue(task, today)}
                  onOpen={() => openTask(task.id)}
                  onOpenDetail={note ? () => openNote(note.id) : undefined}
                  onToggle={() => void toggle(task)}
                  onDoToday={() =>
                    void patch(
                      task,
                      { startDate: today, someday: false },
                      'move',
                    )
                  }
                />
              );
            })}
          </Section>
        ))
      )}
    </Screen>
  );
};

export default UpcomingScreen;

const styles = StyleSheet.create({
  subtitle: {
    ...font.regular,
    fontSize: tokens.text.lg,
    color: color.inkSoft,
  },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
});
