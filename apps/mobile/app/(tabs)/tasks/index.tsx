import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Screen } from '../../../src/ui/Screen';

const TASK_FILTERS = ['open', 'today', 'upcoming', 'someday', 'done'] as const;
type TaskFilter = (typeof TASK_FILTERS)[number];
const TASK_FILTER_LABELS: Record<TaskFilter, string> = {
  open: 'Open',
  today: 'Today',
  upcoming: 'Upcoming',
  someday: 'Someday',
  done: 'Done',
};

const TasksScreen = () => {
  const [filter, setFilter] = useState<TaskFilter>('open');
  return (
    <Screen>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="tablist"
        accessibilityLabel="Task filter"
        style={styles.chipRow}
      >
        {TASK_FILTERS.map((option) => {
          const selected = option === filter;
          return (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityLabel={TASK_FILTER_LABELS[option]}
              accessibilityState={{ selected }}
              onPress={() => setFilter(option)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {TASK_FILTER_LABELS[option]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <EmptyState
        icon="checkmark.square"
        title="No open tasks"
        body="Add a task from a note, or try !high or @fri when writing one."
      />
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
});
