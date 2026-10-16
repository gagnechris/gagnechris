import type { TaskDraft } from '@gagnechris/app-core';
import {
  formatTaskDay,
  notebookAreaName,
  type NotebookArea,
  type NotebookAreaEntry,
  type TaskPriority,
  type TaskStatus,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { StyleSheet, TextInput, View } from 'react-native';
import { color, font } from '../../theme';
import { Checkbox } from '../../ui/Checkbox';
import { ListRow } from '../../ui/ListRow';
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
  areas: readonly NotebookAreaEntry[];
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
  areas,
}: Props) => {
  const done = draft.status === 'done';
  return (
    <>
      <View style={styles.titleRow}>
        <Checkbox
          shape="round"
          label={done ? 'Reopen' : 'Complete'}
          checked={done}
          dropped={draft.status === 'dropped'}
          onChange={onToggleDone}
          size={26}
        />
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
        <ListRow
          title="Shows on"
          meta={showsOnText(draft, today)}
          onPress={onPickShowsOn}
        />
        <ListRow
          divider
          title="Deadline"
          meta={draft.dueDate ? formatTaskDay(draft.dueDate) : 'None'}
          onPress={onPickDeadline}
        />
        <ListRow
          divider
          title="Priority"
          meta={PRIORITY_LABELS[draft.priority]}
          onPress={() =>
            showChoice({
              title: 'Priority',
              options: PRIORITIES,
              labels: PRIORITY_LABELS,
              onChoose: (priority) => setField({ priority }),
            })
          }
        />
        <ListRow
          divider
          title="Area"
          meta={notebookAreaName(areas, draft.area)}
          onPress={() =>
            showChoice<NotebookArea>({
              title: 'Area',
              options: areas.map((a) => a.id),
              labels: Object.fromEntries(areas.map((a) => [a.id, a.name])),
              onChoose: (area) => setField({ area }),
            })
          }
        />
        <ListRow
          divider
          title="Status"
          meta={STATUS_LABELS[draft.status]}
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
  title: {
    flex: 1,
    ...font.bold,
    fontSize: tokens.text.xl,
    color: color.ink,
    paddingVertical: tokens.space[2],
  },
  titleDone: { color: color.muted, textDecorationLine: 'line-through' },
});
