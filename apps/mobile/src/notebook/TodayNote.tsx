import {
  dailyNoteResource,
  isTemplateStartedDaily,
  startDailyNoteBlank,
  useNoteTaskEmbedSync,
  useReportEmbeddedIds,
  useVersionedDocEditor,
  type NotebookArea,
} from '@gagnechris/app-core';
import {
  emptyNoteDraft,
  NOTEBOOK_AREA_LABELS,
  noteDraftFromNote,
  notePayloadFromDraft,
  removeTaskEmbedLines,
  taskEmbedToken,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { nativeRetrySignals } from '../net';
import { color, font, MIN_TARGET } from '../theme';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { nativeConfirm } from '../ui/confirm';
import {
  EditorError,
  EditorNotices,
  RemountOnResolve,
  useDetailEditor,
} from './DetailEditorShell';
import { NoteBodyEditor } from './NoteBodyEditor';
import { showTaskRowsChoice } from './taskActionSheets';
import { useTaskDetailsStore } from './taskDetailsStore';

const DAILY_TAKEN_MESSAGE =
  'Another device started this daily note first. What you typed is still here.';

/** The embed, then an empty line for the context written under it. */
export const appendTaskEmbed = (markdown: string, taskId: string) => {
  const body = markdown.replace(/\s+$/, '');
  return `${body}${body ? '\n\n' : ''}${taskEmbedToken(taskId)}\n\n`;
};

type Props = {
  area: NotebookArea;
  date: string;
  today: string;
  /** The note's embeds, which Still open leaves out; null while loading. */
  onEmbeddedIds: (ids: ReadonlySet<string> | null) => void;
  /** Set while the note can take a new task line. */
  appendEmbedRef: RefObject<((taskId: string) => void) | null>;
  onOpenTask: (id: string) => void;
};

/** A day's note in the note editor; written on first edit, as on web. */
export const TodayNote = (props: Props) => (
  <RemountOnResolve resetKey={`${props.area}:${props.date}`}>
    {(onReload) => <DailyNoteEditor {...props} onReload={onReload} />}
  </RemountOnResolve>
);

const DailyNoteEditor = ({
  area,
  date,
  today,
  onEmbeddedIds,
  appendEmbedRef,
  onOpenTask,
  onReload,
}: Props & { onReload: () => void }) => {
  const router = useRouter();
  const editor = useVersionedDocEditor({
    resource: dailyNoteResource,
    params: { area, date, carryIn: date === today },
    initialDraft: emptyNoteDraft(),
    toDraft: noteDraftFromNote,
    getEntityId: (note) => `${note.area}:${note.date}:${note.id}`,
    toPayload: (current, note) => ({
      id: note.id,
      ...notePayloadFromDraft(current),
    }),
    conflictMessage:
      'Another device changed this daily note. What you typed is still here.',
    conflictMessages: { daily_taken: DAILY_TAKEN_MESSAGE },
    loadErrorFallback: 'Could not load the daily note.',
    confirm: nativeConfirm,
    retrySignals: nativeRetrySignals,
  });
  const { draft, updateDraft, entity, dirty, saveState, save, saveError } =
    editor;
  const { saveLabel, conflict } = useDetailEditor({
    editor,
    conflictId: entity?.id ?? '',
    onReload,
  });

  const { peek } = useTaskDetailsStore();
  const ready = !editor.loadError && !editor.isLoading && Boolean(entity);
  const body = draft.bodyMarkdown;
  useReportEmbeddedIds(ready ? body : null, onEmbeddedIds);

  useEffect(() => {
    if (!ready) return;
    appendEmbedRef.current = (taskId) =>
      updateDraft((prev) => ({
        ...prev,
        bodyMarkdown: appendTaskEmbed(prev.bodyMarkdown, taskId),
      }));
    return () => {
      appendEmbedRef.current = null;
    };
  }, [appendEmbedRef, ready, updateDraft]);

  const embedNote = useMemo(
    () => (entity ? { id: entity.id, area: entity.area } : null),
    [entity],
  );
  const removeDeletedEmbeds = useCallback(
    (ids: ReadonlySet<string>) =>
      updateDraft((prev) => {
        const bodyMarkdown = removeTaskEmbedLines(prev.bodyMarkdown, ids);
        return bodyMarkdown === prev.bodyMarkdown
          ? prev
          : { ...prev, bodyMarkdown };
      }),
    [updateDraft],
  );
  const embeds = useNoteTaskEmbedSync({
    markdown: body,
    note: embedNote,
    today,
    removeEmbeds: removeDeletedEmbeds,
    ensureNoteSaved: save,
  });

  if (editor.loadError) return <EditorError message={editor.loadError} />;
  if (!ready) return <Text style={styles.status}>Loading daily note…</Text>;

  return (
    <View style={styles.note}>
      <View style={styles.header}>
        <Text
          style={styles.saveState}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Daily note: ${saveLabel}`}
        >
          {entity!.version === 0 && !dirty ? 'New' : saveLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Note options"
          onPress={() => showTaskRowsChoice(entity!.id, peek.has(entity!.id))}
          style={styles.options}
        >
          <Icon name="ellipsis" size={16} color={color.inkSoft} />
        </Pressable>
      </View>
      <EditorNotices conflict={conflict} saveError={saveError} dirty={dirty} />
      {isTemplateStartedDaily(entity!) && !dirty && saveState !== 'saving' ? (
        <View style={styles.template} accessibilityRole="summary">
          <Text style={styles.templateText}>
            Started from your {NOTEBOOK_AREA_LABELS[area]} template. It’s saved
            as soon as you type.
          </Text>
          <View style={styles.templateActions}>
            <Button
              title="Start blank"
              variant="secondary"
              onPress={() =>
                editor.replaceFromEntity(startDailyNoteBlank(entity!))
              }
            />
            <Button
              title="Edit template"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/more/templates',
                  params: { template: area },
                })
              }
            />
          </View>
        </View>
      ) : null}
      <NoteBodyEditor
        markdown={body}
        onChange={(bodyMarkdown) =>
          updateDraft((prev) => ({ ...prev, bodyMarkdown }))
        }
        embeds={embeds}
        today={today}
        onOpenTask={onOpenTask}
        note={entity}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  note: { gap: tokens.space[2] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginVertical: -tokens.space[2],
  },
  saveState: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  options: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -tokens.space[3],
  },
  template: {
    gap: tokens.space[2],
    padding: tokens.space[3],
    borderRadius: tokens.radius.sm,
    backgroundColor: color.accentSoft,
  },
  templateText: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.accentInk,
  },
  templateActions: { flexDirection: 'row', gap: tokens.space[2] },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    paddingVertical: tokens.space[6],
  },
});
