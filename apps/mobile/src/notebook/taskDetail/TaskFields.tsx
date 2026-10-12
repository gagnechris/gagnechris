import type { TaskDraft } from '@gagnechris/app-core';
import {
  formatTaskDay,
  NOTEBOOK_AREA_LABELS,
  type NotebookArea,
  type TaskPriority,
  type TaskStatus,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { color, font, MIN_TARGET } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Row } from '../../ui/Row';
import { Section } from '../../ui/Section';
import { showChoice } from '../taskActionSheets';

const PRIORITIES = ['high', 'med', 'low'] as const;
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  med: 'Medium',
  low: 'Low',
};
const STATUSES = ['todo', 'in_progress', 'done', 'dropped'] as const;
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  dropped: 'Dropped',
};
const AREAS = ['work', 'personal'] as const;

const showsOnText = (draft: TaskDraft, today: string) =>
  draft.someday
    ? 'Someday'
    : !draft.startDate || draft.startDate === today
      ? 'Today'
      : formatTaskDay(draft.startDate);

type Props = {
  draft: TaskDraft;
  today: string;
  onTitle: (title: string) => void;
  onToggleDone: () => void;
  setField: (change: Partial<TaskDraft>) => void;
  onPickShowsOn: () => void;
  onPickDeadline: () => void;
};

/** The checkbox and title, then the Shows on … Status rows. */
export const TaskFields = ({
  draft,
  today,
  onTitle,
  onToggleDone,
  setField,
  onPickShowsOn,
  onPickDeadline,
}: Props) => {
  const done = draft.status === 'done';
  return (
    <>
      <View style={styles.titleRow}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? 'Reopen' : 'Complete'}
          onPress={onToggleDone}
          hitSlop={8}
          style={styles.box}
        >
          <Icon
            name={done ? 'checkmark.square.fill' : 'square'}
            size={26}
            color={done ? color.accent : color.inkSoft}
          />
        </Pressable>
        <TextInput
          style={[styles.title, done && styles.titleDone]}
          accessibilityLabel="Title"
          placeholder="Untitled"
          placeholderTextColor={color.muted}
          value={draft.title}
          onChangeText={onTitle}
          multiline
          scrollEnabled={false}
          submitBehavior="blurAndSubmit"
        />
      </View>

      <Section>
        <Row
          title="Shows on"
          detail={showsOnText(draft, today)}
          onPress={onPickShowsOn}
        />
        <Row
          divider
          title="Deadline"
          detail={draft.dueDate ? formatTaskDay(draft.dueDate) : 'None'}
          onPress={onPickDeadline}
        />
        <Row
          divider
          title="Priority"
          detail={PRIORITY_LABELS[draft.priority]}
          onPress={() =>
            showChoice({
              title: 'Priority',
              options: PRIORITIES,
              labels: PRIORITY_LABELS,
              onChoose: (priority) => setField({ priority }),
            })
          }
        />
        <Row
          divider
          title="Area"
          detail={NOTEBOOK_AREA_LABELS[draft.area]}
          onPress={() =>
            showChoice<NotebookArea>({
              title: 'Area',
              options: AREAS,
              labels: NOTEBOOK_AREA_LABELS,
              onChoose: (area) => setField({ area }),
            })
          }
        />
        <Row
          divider
          title="Status"
          detail={STATUS_LABELS[draft.status]}
          onPress={() =>
            showChoice({
              title: 'Status',
              options: STATUSES,
              labels: STATUS_LABELS,
              onChoose: (status) => setField({ status }),
            })
          }
        />
      </Section>
    </>
  );
};

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  box: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    ...font.bold,
    fontSize: tokens.text.xl,
    color: color.ink,
    paddingVertical: tokens.space[2],
  },
  titleDone: { color: color.muted, textDecorationLine: 'line-through' },
});
