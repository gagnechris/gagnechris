import { comingUpDayLabel, type ComingUpDay } from '@gagnechris/shared';
import type { Task, TodayStillOpenRow } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { TaskRow } from '../ui/TaskRow';
import { Tabs } from '../ui/Tabs';
import { TextButton } from '../ui/TextButton';
import { TaskParentsProvider } from './taskParents';

type Tab = 'stillOpen' | 'comingUp';

type Props = {
  visible: boolean;
  onClose: () => void;
  day: string;
  stillOpen: TodayStillOpenRow[];
  comingUp: ComingUpDay<Task>[];
  loading: boolean;
  error: string | null;
  onToggle: (task: Task) => void;
  onOpenTask: (task: Task) => void;
  onOpenNote: (noteId: string) => void;
  onMore: (task: Task) => void;
  /** Absent when the day's note can't take a task (not today). */
  onAddToNote?: (task: Task) => void;
};

/** The banner's sheet: Still open and Coming up, as tabs. */
export const TodaySheet = ({
  visible,
  onClose,
  day,
  stillOpen,
  comingUp,
  loading,
  error,
  onToggle,
  onOpenTask,
  onOpenNote,
  onMore,
  onAddToNote,
}: Props) => {
  const [tab, setTab] = useState<Tab>('stillOpen');
  const comingUpCount = comingUp.reduce((n, d) => n + d.tasks.length, 0);
  const listed = [
    ...stillOpen.map((row) => row.task),
    ...comingUp.flatMap((d) => d.tasks),
  ];
  const rowActions = (task: Task) => ({
    onToggle: () => onToggle(task),
    onMore: () => onMore(task),
    onAddToNote: onAddToNote ? () => onAddToNote(task) : undefined,
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Today’s tasks
          </Text>
          <TextButton strong align="end" onPress={onClose}>
            Done
          </TextButton>
        </View>
        <Tabs
          label="Today’s tasks"
          items={[
            { key: 'stillOpen', label: 'Still open', count: stillOpen.length },
            { key: 'comingUp', label: 'Coming up', count: comingUpCount },
          ]}
          selected={tab}
          onSelect={setTab}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <TaskParentsProvider tasks={listed}>
          <ScrollView contentContainerStyle={styles.list}>
            {loading ? (
              <Text style={styles.empty}>Loading tasks…</Text>
            ) : tab === 'stillOpen' ? (
              stillOpen.length === 0 ? (
                <Text style={styles.empty}>Nothing left open.</Text>
              ) : (
                stillOpen.map(({ task, source, due }) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    detail={source.label}
                    due={due}
                    onOpen={() => onOpenTask(task)}
                    onOpenDetail={
                      source.noteId
                        ? () => onOpenNote(source.noteId!)
                        : () => onOpenTask(task)
                    }
                    {...rowActions(task)}
                  />
                ))
              )
            ) : comingUp.length === 0 ? (
              <Text style={styles.empty}>
                Nothing scheduled for the next two weeks.
              </Text>
            ) : (
              comingUp.map(({ date, tasks }) => (
                <View key={date}>
                  <Text style={styles.dayLabel} accessibilityRole="header">
                    {comingUpDayLabel(date, day)}
                  </Text>
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onOpen={() => onOpenTask(task)}
                      onToggle={() => onToggle(task)}
                      onAddToNote={
                        onAddToNote ? () => onAddToNote(task) : undefined
                      }
                    />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        </TaskParentsProvider>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: color.surface,
    padding: tokens.space[4],
    gap: tokens.space[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...font.bold, fontSize: tokens.text.xl, color: color.ink },
  list: { paddingBottom: tokens.space[8] },
  dayLabel: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    textTransform: 'uppercase',
    paddingTop: tokens.space[4],
  },
  empty: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    paddingVertical: tokens.space[6],
    textAlign: 'center',
  },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
});
