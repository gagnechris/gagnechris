import {
  emptyTaskDraft,
  taskDraftFromTask,
  taskPayloadFromDraft,
  taskResource,
  useDeleteTaskMutation,
  useNotebookAreas,
  useVersionedDocEditor,
  type TaskDraft,
} from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { ActionSheetIOS, Share, StyleSheet } from 'react-native';
import { nativeRetrySignals } from '../../../src/net';
import {
  DetailEditorShell,
  detailEditorRoute,
  type DetailScreenProps,
} from '../../../src/notebook/DetailEditorShell';
import { useDetailRoutes } from '../../../src/notebook/detailRoutes';
import { TaskActionBar } from '../../../src/notebook/taskDetail/TaskActionBar';
import { TaskDescription } from '../../../src/notebook/taskDetail/TaskDescription';
import { TaskFields } from '../../../src/notebook/taskDetail/TaskFields';
import { useTaskDates } from '../../../src/notebook/taskDetail/useTaskDates';
import { TaskMentions } from '../../../src/notebook/TaskMentions';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { color } from '../../../src/theme';
import { confirmAction, nativeConfirm } from '../../../src/ui/confirm';

const DELETE_PROMPT = 'delete-task';

const TaskScreen = ({ id, onReload }: DetailScreenProps) => {
  const router = useRouter();
  const routes = useDetailRoutes();
  const today = useLocalToday();
  const [preview, setPreview] = useState(false);
  const [flushes, setFlushes] = useState(0);
  const deleteMutation = useDeleteTaskMutation();
  const areas = useNotebookAreas();

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
  const { draft, updateDraft, save } = editor;

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
  const { pickShowsOn, pickDeadline, datePicker } = useTaskDates({
    draft,
    today,
    setField,
  });

  const done = draft.status === 'done';
  const toggleDone = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setField({ status: done ? 'todo' : 'done' });
  };

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

  const ready = !editor.isLoading && editor.entity;

  return (
    <DetailEditorShell
      editor={editor}
      conflictId={id}
      onReload={onReload}
      openPath={routes.taskPath}
      loadingText="Loading task…"
      menuLabel="Task actions"
      onMenu={showMenu}
      backgroundColor={color.background}
      contentStyle={styles.content}
      footer={
        <>
          {ready ? (
            <TaskActionBar
              done={done}
              onToggleDone={toggleDone}
              onSnooze={() => pickShowsOn('Snooze until')}
            />
          ) : null}
          {datePicker}
        </>
      }
    >
      {(task) => (
        <>
          <TaskFields
            draft={draft}
            today={today}
            onTitle={(title) => updateDraft((prev) => ({ ...prev, title }))}
            onToggleDone={toggleDone}
            setField={setField}
            onPickShowsOn={() => pickShowsOn('Show this task on')}
            onPickDeadline={pickDeadline}
            areas={areas}
          />
          <TaskDescription
            description={draft.description}
            onChange={(description) =>
              updateDraft((prev) => ({ ...prev, description }))
            }
            preview={preview}
            onTogglePreview={() => setPreview((on) => !on)}
          />
          <TaskMentions
            taskId={task.id}
            homeNoteId={task.noteId}
            today={today}
            onOpenNote={routes.openListedNote}
          />
        </>
      )}
    </DetailEditorShell>
  );
};

export default detailEditorRoute(TaskScreen);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[8],
    gap: tokens.space[4],
  },
});
