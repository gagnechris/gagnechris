import {
  dailyNoteResource,
  isTemplateStartedDaily,
  startDailyNoteBlank,
  useNoteTaskEmbedSync,
  useVersionedDocEditor,
  type NotebookArea,
} from '@gagnechris/app-core';
import {
  NOTEBOOK_AREA_LABELS,
  taskEmbedIds,
  taskEmbedToken,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EditorOfflineNotice, nativeRetrySignals, useIsOnline } from '../net';
import { color, font } from '../theme';
import { Button } from '../ui/Button';
import { nativeConfirm } from '../ui/confirm';
import { ConflictPanel } from './ConflictPanel';
import { NoteBodyEditor } from './NoteBodyEditor';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from './noteDraft';
import { saveLabel } from './saveLabel';
import { useSaveOnBackground } from './useSaveOnBackground';

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
export const TodayNote = (props: Props) => {
  // Remounted after a conflict is settled, so the editor takes the result.
  const [epoch, setEpoch] = useState(0);
  return (
    <DailyNoteEditor
      key={`${props.area}:${props.date}:${epoch}`}
      {...props}
      onReload={() => setEpoch((n) => n + 1)}
    />
  );
};

const DailyNoteEditor = ({
  area,
  date,
  today,
  onEmbeddedIds,
  appendEmbedRef,
  onOpenTask,
  onReload,
}: Props & { onReload: () => void }) => {
  const online = useIsOnline();
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
      <ConflictPanel entityId={entity!.id} onResolved={onReload} />
      {saveError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {saveError}
        </Text>
      ) : null}
      <EditorOfflineNotice dirty={dirty} />
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
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    paddingVertical: tokens.space[6],
  },
});
