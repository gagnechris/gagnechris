import {
  taskActionError,
  taskDraftFromTask,
  usePatchTaskMutation,
  useTaskDescriptionEditor,
  useTaskToggle,
  type Task,
  type TaskDraft,
  type TaskPatch,
} from '@gagnechris/app-core';
import {
  formatTaskDay,
  parseTagsText,
  saveLabel,
  taskScheduleLabel,
  type TaskPriority,
  type TaskStatus,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Chip } from '../ui/Chip';
import { LiveMarkdownInput } from '../ui/LiveMarkdownInput';
import { showChoice } from './taskActionSheets';
import { useTaskDates } from './taskDetail/useTaskDates';

const STATUSES = ['todo', 'in_progress', 'done', 'dropped'] as const;
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  dropped: 'Dropped',
};
const PRIORITIES = ['high', 'med', 'low'] as const;
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High priority',
  med: 'Medium priority',
  low: 'Low priority',
};

type Props = { task: Task; today: string };

/** A task's description and fields, under its row in a note. */
export const TaskDetailsPanel = ({ task, today }: Props) => {
  const description = useTaskDescriptionEditor(task);
  const { mutateAsync: patchTask } = usePatchTaskMutation();
  const { toggle, error: toggleError } = useTaskToggle();
  const [patchError, setPatchError] = useState<string | null>(null);

  const patch = (changes: TaskPatch) => {
    setPatchError(null);
    patchTask({ id: task.id, version: task.version, patch: changes }).catch(
      (err: unknown) =>
        setPatchError(taskActionError('update', task.title, err)),
    );
  };

  const setField = (change: Partial<TaskDraft>) =>
    patch({
      ...(change.startDate !== undefined && {
        startDate: change.startDate || null,
      }),
      ...(change.someday !== undefined && { someday: change.someday }),
      ...(change.dueDate !== undefined && { dueDate: change.dueDate || null }),
    });
  const { pickShowsOn, pickDeadline, datePicker } = useTaskDates({
    draft: taskDraftFromTask(task),
    today,
    setField,
  });

  const setStatus = (status: TaskStatus) => {
    if (status === task.status) return;
    // Complete and reopen go through the toggle, as the checkbox does.
    if (
      (status === 'done' && task.status === 'todo') ||
      (status === 'todo' && task.status === 'done')
    ) {
      void toggle(task);
      return;
    }
    patch({ status });
  };

  const editTags = () =>
    Alert.prompt(
      'Tags',
      'Separate tags with commas.',
      (text) => {
        const tags = parseTagsText(text ?? '');
        if (tags.join(',') !== task.tags.join(',')) patch({ tags });
      },
      'plain-text',
      task.tags.join(', '),
    );

  const start = taskScheduleLabel(task.startDate, today, task.someday);
  const due = task.dueDate ? formatTaskDay(task.dueDate) : null;
  const error = patchError ?? toggleError ?? description.saveError;
  const saving = description.dirty || description.saveState === 'saving';

  return (
    <View style={styles.panel}>
      <LiveMarkdownInput
        variant="note"
        accessibilityLabel={`Description of ${task.title}`}
        placeholder="Add details…"
        value={description.value}
        onChangeText={description.onChange}
      />
      <View style={styles.chips}>
        <Chip
          accessibilityLabel={`Status: ${STATUS_LABELS[task.status]}`}
          onPress={() =>
            showChoice({
              title: 'Status',
              options: STATUSES,
              labels: STATUS_LABELS,
              onChoose: setStatus,
            })
          }
        >
          {STATUS_LABELS[task.status]}
        </Chip>
        <Chip
          accessibilityLabel={`Start: ${start ?? 'none'}`}
          onPress={() => pickShowsOn('Show this task on')}
        >
          {start ? `Start ${start}` : 'Start'}
        </Chip>
        <Chip
          accessibilityLabel={`Due: ${due ?? 'none'}`}
          onPress={pickDeadline}
        >
          {due ? `Due ${due}` : 'Due'}
        </Chip>
        <Chip
          accessibilityLabel={`Priority: ${PRIORITY_LABELS[task.priority]}`}
          onPress={() =>
            showChoice({
              title: 'Priority',
              options: PRIORITIES,
              labels: PRIORITY_LABELS,
              onChoose: (priority) => patch({ priority }),
            })
          }
        >
          {PRIORITY_LABELS[task.priority]}
        </Chip>
        <Chip
          accessibilityLabel={
            task.tags.length ? `Tags: ${task.tags.join(', ')}` : 'Add tags'
          }
          onPress={editTags}
        >
          {task.tags.length
            ? task.tags.map((t) => `#${t}`).join(' ')
            : 'Add tags'}
        </Chip>
        {saving ? (
          <Text style={styles.save} accessibilityLiveRegion="polite">
            {saveLabel(description.saveState, description.dirty)}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {datePicker}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    marginLeft: MIN_TARGET - tokens.space[2],
    paddingLeft: tokens.space[3],
    paddingBottom: tokens.space[2],
    borderLeftWidth: 2,
    borderLeftColor: color.border,
    gap: tokens.space[2],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.space[2],
  },
  save: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.muted,
  },
  error: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.alert,
  },
});
