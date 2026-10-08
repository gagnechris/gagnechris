import {
  dailyNoteResource,
  useMergeIntoDailyNoteMutation,
  useNoteTaskEmbedSync,
  useVersionedDocEditor,
  type NotebookArea,
} from '@gagnechris/app-core';
import { taskEmbedIds, taskEmbedToken } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useEffect, useMemo, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EditorOfflineNotice, nativeRetrySignals, useIsOnline } from '../net';
import { color, font, MIN_TARGET } from '../theme';
import { nativeConfirm } from '../ui/confirm';
import { NoteBodyEditor } from './NoteBodyEditor';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from './noteDraft';
import { saveLabel } from './saveLabel';
import { useSaveOnBackground } from './useSaveOnBackground';

export const DAILY_TAKEN_MESSAGE =
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
export const TodayNote = ({
  area,
  date,
  today,
  onEmbeddedIds,
  appendEmbedRef,
  onOpenTask,
}: Props) => {
  const online = useIsOnline();
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
  const merge = useMergeIntoDailyNoteMutation();
  useSaveOnBackground(dirty, save);

  const ready = !editor.loadError && !editor.isLoading && Boolean(entity);
  const body = draft.bodyMarkdown;
  useEffect(() => {
    onEmbeddedIds(ready ? new Set(taskEmbedIds(body)) : null);
  }, [onEmbeddedIds, ready, body]);

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
  const embeds = useNoteTaskEmbedSync({
    markdown: body,
    note: embedNote,
    today,
    ensureNoteSaved: save,
  });

  if (editor.loadError) {
    return (
      <Text style={styles.error} accessibilityRole="alert">
        {editor.loadError}
      </Text>
    );
  }
  if (!ready) return <Text style={styles.status}>Loading daily note…</Text>;

  return (
    <View style={styles.note}>
      <Text
        style={styles.saveState}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Daily note: ${saveLabel(saveState, dirty, !online)}`}
      >
        {entity!.version === 0 && !dirty
          ? 'New'
          : saveLabel(saveState, dirty, !online)}
      </Text>
      {saveError ? (
        <View style={styles.alert} accessibilityRole="alert">
          <Text style={styles.error}>
            {merge.error ? merge.error.message : saveError}
          </Text>
          {saveError === DAILY_TAKEN_MESSAGE ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add it to their note"
              onPress={() =>
                merge.mutate(
                  { area, date, bodyMarkdown: draft.bodyMarkdown },
                  { onSuccess: () => editor.setSaveError(null) },
                )
              }
              disabled={merge.isPending}
              style={styles.mergeButton}
            >
              <Text style={styles.mergeText}>
                {merge.isPending ? 'Adding…' : 'Add it to their note'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <EditorOfflineNotice dirty={dirty} />
      <NoteBodyEditor
        markdown={body}
        onChange={(bodyMarkdown) =>
          updateDraft((prev) => ({ ...prev, bodyMarkdown }))
        }
        embeds={embeds}
        today={today}
        onOpenTask={onOpenTask}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  note: { gap: tokens.space[2] },
  saveState: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    alignSelf: 'flex-end',
  },
  alert: { gap: tokens.space[1] },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
  mergeButton: { minHeight: MIN_TARGET, justifyContent: 'center' },
  mergeText: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.accent,
  },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    paddingVertical: tokens.space[6],
  },
});
