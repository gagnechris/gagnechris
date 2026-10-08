import {
  emptyTaskDraft,
  taskDraftFromTask,
  taskPayloadFromDraft,
  taskResource,
  useDeleteTaskMutation,
  useVersionedDocEditor,
  type TaskDraft,
} from '@gagnechris/app-core';
import {
  formatTaskDay,
  NOTEBOOK_AREA_LABELS,
  type NotebookArea,
  type TaskPriority,
  type TaskSchedule,
  type TaskStatus,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import {
  ActionSheetIOS,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MarkdownView } from '../../../src/markdown/MarkdownView';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import { PickDateModal } from '../../../src/notebook/PickDateModal';
import { saveLabel } from '../../../src/notebook/saveLabel';
import {
  showChoice,
  showTaskDates,
} from '../../../src/notebook/taskActionSheets';
import { TaskMentions } from '../../../src/notebook/TaskMentions';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { useSaveOnBackground } from '../../../src/notebook/useSaveOnBackground';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { confirmAction, nativeConfirm } from '../../../src/ui/confirm';
import { Icon } from '../../../src/ui/Icon';
import { Row } from '../../../src/ui/Row';
import { Section } from '../../../src/ui/Section';

const DELETE_PROMPT = 'delete-task';

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

type DatePick = 'start' | 'due' | null;

const showsOnText = (draft: TaskDraft, today: string) =>
  draft.someday
    ? 'Someday'
    : !draft.startDate || draft.startDate === today
      ? 'Today'
      : formatTaskDay(draft.startDate);

const TaskScreen = () => {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const today = useLocalToday();
  const [preview, setPreview] = useState(false);
  const [picking, setPicking] = useState<DatePick>(null);
  const [flushes, setFlushes] = useState(0);
  const deleteMutation = useDeleteTaskMutation();

  const editor = useVersionedDocEditor({
    resource: taskResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyTaskDraft(),
    toDraft: taskDraftFromTask,
    getEntityId: (task) => task.id,
    toPayload: taskPayloadFromDraft,
    conflictMessage:
      'Another device changed this task. Go back and open it again.',
    loadErrorFallback: 'Could not load this task.',
    confirm: (message) =>
      message === DELETE_PROMPT
        ? confirmAction(
            'Delete this task?',
            'It disappears from your lists and the notes that embed it.',
            'Delete',
          )
        : nativeConfirm(message),
    retrySignals: nativeRetrySignals,
    delete: {
      confirm: DELETE_PROMPT,
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id, version });
      },
      onDeleted: () => router.back(),
    },
  });
  const { draft, updateDraft, entity, dirty, saveState, save } = editor;
  useSaveOnBackground(dirty, save);

  // A field change saves now rather than after the typing debounce, so
  // Today, Coming up and Upcoming move the task at once.
  const flush = useEffectEvent(() => void save());
  useEffect(() => {
    if (flushes > 0) flush();
  }, [flushes]);
  const setField = (change: Partial<TaskDraft>) => {
    updateDraft((prev) => ({ ...prev, ...change }));
    setFlushes((n) => n + 1);
  };
  const schedule = ({ startDate, someday }: TaskSchedule) =>
    setField({ startDate: startDate ?? '', someday });

  const done = draft.status === 'done';
  const toggleDone = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setField({ status: done ? 'todo' : 'done' });
  };

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

  const showMenu = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Share', 'Delete', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) {
          void Share.share({
            title: draft.title,
            message: draft.description
              ? `${draft.title}\n\n${draft.description}`
              : draft.title,
          });
        }
        if (index === 1) void editor.runDelete();
      },
    );

  if (editor.loadError) {
    return (
      <Text style={styles.status} accessibilityRole="alert">
        {editor.loadError}
      </Text>
    );
  }
  const ready = !editor.isLoading && entity;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerRight}>
              <Text
                style={styles.saveState}
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
              >
                {saveLabel(saveState, dirty, !online)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Task actions"
                onPress={showMenu}
                style={styles.headerButton}
                disabled={!ready}
              >
                <Icon name="ellipsis.circle" color={color.ink} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {editor.saveError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {editor.saveError}
          </Text>
        ) : null}
        <EditorOfflineNotice dirty={dirty} />
        {!ready ? (
          <Text style={styles.status}>Loading task…</Text>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={done ? 'Reopen' : 'Complete'}
                onPress={toggleDone}
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
                onChangeText={(title) =>
                  updateDraft((prev) => ({ ...prev, title }))
                }
                multiline
                scrollEnabled={false}
                submitBehavior="blurAndSubmit"
              />
            </View>

            <Section>
              <Row
                title="Shows on"
                detail={showsOnText(draft, today)}
                onPress={() => pickShowsOn('Show this task on')}
              />
              <Row
                divider
                title="Deadline"
                detail={draft.dueDate ? formatTaskDay(draft.dueDate) : 'None'}
                onPress={pickDeadline}
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

            <View style={styles.descriptionHeader}>
              <Text style={styles.label} accessibilityRole="header">
                DESCRIPTION
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Preview"
                accessibilityState={{ selected: preview }}
                onPress={() => setPreview((on) => !on)}
                style={styles.headerButton}
              >
                <Icon
                  name={preview ? 'eye.fill' : 'eye'}
                  size={18}
                  color={preview ? color.accent : color.inkSoft}
                />
              </Pressable>
            </View>
            {preview ? (
              <View style={styles.description}>
                <MarkdownView markdown={draft.description} />
              </View>
            ) : (
              <TextInput
                style={[styles.description, styles.descriptionInput]}
                accessibilityLabel="Description"
                placeholder="Notes, links, markdown"
                placeholderTextColor={color.muted}
                value={draft.description}
                onChangeText={(description) =>
                  updateDraft((prev) => ({ ...prev, description }))
                }
                multiline
                scrollEnabled={false}
              />
            )}

            <TaskMentions
              taskId={entity.id}
              homeNoteId={entity.noteId}
              today={today}
              onOpenNote={(noteId) => router.push(`/notes/${noteId}`)}
            />
          </>
        )}
      </ScrollView>
      {ready ? (
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: insets.bottom + tokens.space[2] },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={done ? 'Reopen task' : 'Complete task'}
            onPress={toggleDone}
            style={[styles.barButton, styles.primary]}
          >
            <Text style={styles.primaryText}>
              {done ? 'Reopen' : 'Complete'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Snooze"
            onPress={() => pickShowsOn('Snooze until')}
            style={[styles.barButton, styles.secondary]}
          >
            <Text style={styles.secondaryText}>Snooze</Text>
          </Pressable>
        </View>
      ) : null}
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
    </View>
  );
};

export default TaskScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[8],
    gap: tokens.space[4],
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
  },
  headerButton: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveState: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
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
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: tokens.space[4],
    marginBottom: -tokens.space[3],
  },
  label: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    letterSpacing: 0.6,
    color: color.inkSoft,
  },
  description: {
    backgroundColor: color.surface,
    borderRadius: tokens.radius.lg - 4,
    padding: tokens.space[4],
    minHeight: 120,
  },
  descriptionInput: {
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
    textAlignVertical: 'top',
  },
  bottomBar: {
    flexDirection: 'row',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[2],
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  barButton: {
    flex: 1,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
  },
  primary: { backgroundColor: color.accent },
  primaryText: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.surface,
  },
  secondary: { backgroundColor: color.fill },
  secondaryText: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.ink,
  },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    textAlign: 'center',
    padding: tokens.space[6],
  },
});
