import {
  useTaskPatch,
  useTasksQuery,
  useTaskToggle,
  type Task,
} from '@gagnechris/app-core';
import {
  isOpenTaskStatus,
  taskCheckboxAction,
  matchesTaskShowOn,
  sortTasksForList,
  taskShowOnQuery,
  notebookAreaName,
  TASK_SHOW_ON_FILTERS,
  TASK_SHOW_ON_LABELS,
  taskDue,
  formatTaskDay,
  type TaskShowOnFilter,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useArea } from '../../../src/area';
import { QuickAddTask } from '../../../src/notebook/QuickAddTask';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { AreaChip } from '../../../src/ui/AreaChip';
import { EmptyState } from '../../../src/ui/EmptyState';
import { PressArea } from '../../../src/ui/PressArea';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';
import { SegmentedRadio, segmentOptions } from '../../../src/ui/SegmentedRadio';
import { SwipeRow } from '../../../src/ui/SwipeRow';
import { TaskRow } from '../../../src/ui/TaskRow';
import { TaskParentsProvider } from '../../../src/notebook/taskParents';

const STATUSES = ['open', 'done', 'dropped'] as const;
type StatusFilter = (typeof STATUSES)[number];
const STATUS_LABELS: Record<StatusFilter, string> = {
  open: 'Open',
  done: 'Done',
  dropped: 'Dropped',
};
const EMPTY: Record<StatusFilter, { title: string; body: string }> = {
  open: {
    title: 'No open tasks',
    body: 'Add a task above, or try !high or @fri when writing one.',
  },
  done: { title: 'Nothing done yet', body: 'Completed tasks show here.' },
  dropped: { title: 'Nothing dropped', body: 'Dropped tasks show here.' },
};

const inStatus = (task: Task, status: StatusFilter) =>
  status === 'open' ? isOpenTaskStatus(task.status) : task.status === status;

const scheduleText = (task: Task) =>
  task.someday
    ? 'Someday'
    : task.startDate
      ? `Shows ${formatTaskDay(task.startDate)}`
      : '';

const TasksScreen = () => {
  const router = useRouter();
  const { area, areaName, areas } = useArea();
  const today = useLocalToday();
  // Every area until one is picked; quick add goes to the switch's area.
  const [allAreas, setAllAreas] = useState(true);
  const listArea = allAreas ? undefined : area;
  const [status, setStatus] = useState<StatusFilter>('open');
  const [showOn, setShowOn] = useState<TaskShowOnFilter>('');
  const [refreshing, setRefreshing] = useState(false);

  const tasks = useTasksQuery({
    area: listArea,
    today,
    limit: 50,
    ...(status === 'open' ? { open: true } : { status }),
    ...taskShowOnQuery(showOn, today),
  });
  const items = useMemo(
    () =>
      sortTasksForList(
        (tasks.data?.pages.flatMap((p) => p.items) ?? []).filter(
          (t) => inStatus(t, status) && matchesTaskShowOn(t, showOn, today),
        ),
        today,
      ),
    [tasks.data, status, showOn, today],
  );

  const { toggle, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const complete = (task: Task) => void toggle(task);
  const drop = (task: Task) => void patch(task, { status: 'dropped' });
  const reopen = (task: Task) =>
    task.status === 'done'
      ? void toggle(task)
      : void patch(task, { status: 'todo' }, 'reopen');

  const showMore = (task: Task) => {
    const open = isOpenTaskStatus(task.status);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: task.title,
        options: open ? ['Complete', 'Drop', 'Cancel'] : ['Reopen', 'Cancel'],
        destructiveButtonIndex: open ? 1 : undefined,
        cancelButtonIndex: open ? 2 : 1,
      },
      (index) => {
        if (!open) {
          if (index === 0) reopen(task);
          return;
        }
        if (index === 0) complete(task);
        if (index === 1) drop(task);
      },
    );
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await tasks.refetch();
    } finally {
      setRefreshing(false);
    }
  };

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
      <Stack.Screen
        options={{
          headerRight: () => (
            <AreaChip all={{ selected: allAreas, onChange: setAllAreas }} />
          ),
        }}
      />
      <QuickAddTask
        area={area}
        today={today}
        label="Quick add task"
        placeholder={`Add to ${areaName}: Call Sam @tomorrow`}
      />
      <SegmentedRadio
        label="Status"
        options={segmentOptions(STATUSES, STATUS_LABELS)}
        value={status}
        onChange={setStatus}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="tablist"
        accessibilityLabel="Show on"
        style={styles.chipRow}
      >
        {TASK_SHOW_ON_FILTERS.map((option) => {
          const selected = option === showOn;
          const label = option ? TASK_SHOW_ON_LABELS[option] : 'Any day';
          return (
            <PressArea
              key={option || 'any'}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => setShowOn(option)}
              feedback="fade"
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {label}
              </Text>
            </PressArea>
          );
        })}
      </ScrollView>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {tasks.isError && items.length === 0 ? (
        <Text style={styles.error} accessibilityRole="alert">
          Could not load tasks. Pull to try again.
        </Text>
      ) : tasks.isPending ? (
        <Text style={styles.status}>Loading tasks…</Text>
      ) : items.length === 0 ? (
        showOn ? (
          <Text style={styles.status}>No tasks match.</Text>
        ) : (
          <EmptyState icon="checkmark.square" title={EMPTY[status].title}>
            {EMPTY[status].body}
          </EmptyState>
        )
      ) : (
        <TaskParentsProvider tasks={items}>
          <Section>
            {items.map((task) => {
              const open = isOpenTaskStatus(task.status);
              return (
                <SwipeRow
                  key={task.id}
                  right={
                    open
                      ? {
                          label: 'Complete',
                          tint: color.accent,
                          run: () => complete(task),
                        }
                      : {
                          label: 'Reopen',
                          tint: color.accent,
                          run: () => reopen(task),
                        }
                  }
                  left={
                    open
                      ? {
                          label: 'Drop',
                          tint: color.alert,
                          run: () => drop(task),
                        }
                      : undefined
                  }
                >
                  <TaskRow
                    task={task}
                    detail={[
                      allAreas ? notebookAreaName(areas, task.area) : '',
                      scheduleText(task),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    due={open ? taskDue(task, today) : null}
                    priority={task.priority}
                    onOpen={() => router.push(`/tasks/${task.id}`)}
                    onToggle={() =>
                      taskCheckboxAction(task.status) === 'reopen'
                        ? reopen(task)
                        : complete(task)
                    }
                    onMore={() => showMore(task)}
                    moreLabel={open ? 'Complete or drop' : 'Reopen'}
                  />
                </SwipeRow>
              );
            })}
          </Section>
        </TaskParentsProvider>
      )}
      {tasks.hasNextPage ? (
        <Button
          disabled={tasks.isFetchingNextPage}
          onPress={() => void tasks.fetchNextPage()}
        >
          {tasks.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </Screen>
  );
};

export default TasksScreen;

const styles = StyleSheet.create({
  chipRow: { marginHorizontal: -tokens.space[4] },
  chips: { gap: tokens.space[2], paddingHorizontal: tokens.space[4] },
  chip: {
    minHeight: MIN_TARGET,
    justifyContent: 'center',
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipSelected: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.ink,
  },
  chipTextSelected: { ...font.semibold, color: color.surface },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
});
