import {
  noteResource,
  useDeleteNoteMutation,
  useLatest,
  useNoteTaskEmbedSync,
  useVersionedDocEditor,
} from '@gagnechris/app-core';
import { NOTEBOOK_AREA_LABELS, noteTitle } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MarkdownView } from '../../../src/markdown/MarkdownView';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import { NoteBodyEditor } from '../../../src/notebook/NoteBodyEditor';
import {
  deleteNoteMessage,
  deleteNoteTitle,
} from '../../../src/notebook/noteActions';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from '../../../src/notebook/noteDraft';
import { saveLabel } from '../../../src/notebook/saveLabel';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { confirmAction, nativeConfirm } from '../../../src/ui/confirm';
import { Icon } from '../../../src/ui/Icon';
import { TaskEmbedRow } from '../../../src/ui/TaskEmbedRow';

const DELETE_PROMPT = 'delete-note';

const NoteScreen = () => {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useIsOnline();
  const today = useLocalToday();
  const [preview, setPreview] = useState(false);
  const deleteMutation = useDeleteNoteMutation();

  const editor = useVersionedDocEditor({
    resource: noteResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyNoteDraft(),
    toDraft: noteDraftFromNote,
    getEntityId: (note) => note.id,
    toPayload: notePayloadFromDraft,
    conflictMessage:
      'Another device changed this note. Go back and open it again.',
    loadErrorFallback: 'Could not load this note.',
    confirm: (message) =>
      message === DELETE_PROMPT
        ? confirmAction(
            deleteNoteTitle({ type: noteType.current }),
            deleteNoteMessage({ type: noteType.current }),
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

  const noteType: { readonly current: 'daily' | 'page' } = useLatest(
    entity?.type ?? 'page',
  );

  // iOS may end a backgrounded app without warning: send edits on the way out.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && dirty) void save();
    });
    return () => subscription.remove();
  }, [dirty, save]);

  const embedNote = useMemo(
    () => (entity ? { id: entity.id, area: entity.area } : null),
    [entity],
  );
  const embeds = useNoteTaskEmbedSync({
    markdown: draft.bodyMarkdown,
    note: embedNote,
    today,
  });
  const openTask = useCallback(
    (taskId: string) => router.push(`/tasks/${taskId}`),
    [router],
  );

  const setTitle = useCallback(
    (title: string) => updateDraft((prev) => ({ ...prev, title })),
    [updateDraft],
  );
  const setBody = useCallback(
    (bodyMarkdown: string) =>
      updateDraft((prev) => ({ ...prev, bodyMarkdown })),
    [updateDraft],
  );

  const addTag = () =>
    Alert.prompt('Add a tag', undefined, (value) => {
      const tag = value?.trim();
      if (!tag) return;
      updateDraft((prev) =>
        prev.tags.includes(tag) ? prev : { ...prev, tags: [...prev.tags, tag] },
      );
    });

  const removeTag = async (tag: string) => {
    if (await confirmAction(`Remove “${tag}”?`, '', 'Remove')) {
      updateDraft((prev) => ({
        ...prev,
        tags: prev.tags.filter((t) => t !== tag),
      }));
    }
  };

  const showMenu = () => {
    const options = [
      draft.pinned ? 'Unpin' : 'Pin',
      'Share',
      'Delete',
      'Cancel',
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
      (index) => {
        if (index === 0) {
          updateDraft((prev) => ({ ...prev, pinned: !prev.pinned }));
        } else if (index === 1) {
          void Share.share({
            title: draft.title || 'Note',
            message: draft.bodyMarkdown,
          });
        } else if (index === 2) {
          void editor.runDelete();
        }
      },
    );
  };

  if (editor.loadError) {
    return (
      <Text style={styles.status} accessibilityRole="alert">
        {editor.loadError}
      </Text>
    );
  }

  const ready = !editor.isLoading && entity;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: '',
          headerLargeTitleEnabled: false,
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
                accessibilityLabel="Preview"
                accessibilityState={{ selected: preview }}
                onPress={() => setPreview((on) => !on)}
                style={styles.headerButton}
                disabled={!ready}
              >
                <Icon
                  name={preview ? 'eye.fill' : 'eye'}
                  color={preview ? color.accent : color.ink}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Note actions"
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
      {editor.saveError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {editor.saveError}
        </Text>
      ) : null}
      <EditorOfflineNotice dirty={dirty} />
      {!ready ? (
        <Text style={styles.status}>Loading note…</Text>
      ) : (
        <>
          <TextInput
            style={styles.title}
            accessibilityLabel="Title"
            placeholder="Untitled"
            placeholderTextColor={color.muted}
            value={entity.type === 'daily' ? noteTitle(entity) : draft.title}
            onChangeText={setTitle}
            editable={entity.type === 'page' && !preview}
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
          />
          <View style={styles.chips}>
            <View
              style={styles.chip}
              accessible
              accessibilityLabel={`Area: ${NOTEBOOK_AREA_LABELS[entity.area]}`}
            >
              <Text style={styles.chipText}>
                {NOTEBOOK_AREA_LABELS[entity.area]}
              </Text>
            </View>
            {draft.pinned ? (
              <View style={styles.chip} accessible accessibilityLabel="Pinned">
                <Icon name="pin.fill" size={12} color={color.inkSoft} />
              </View>
            ) : null}
            {draft.tags.map((tag) => (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={`Tag ${tag}`}
                accessibilityHint="Removes the tag"
                onPress={() => void removeTag(tag)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>#{tag}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add tag"
              onPress={addTag}
              style={[styles.chip, styles.addChip]}
            >
              <Text style={styles.addText}>+ tag</Text>
            </Pressable>
          </View>
          {preview ? (
            <MarkdownView
              markdown={draft.bodyMarkdown}
              renderTaskEmbed={({ id: taskId }) => {
                const state = embeds.stateOf(taskId);
                return (
                  <TaskEmbedRow
                    state={state}
                    onOpen={
                      state.kind === 'task' && state.saved
                        ? () => openTask(taskId)
                        : undefined
                    }
                  />
                );
              }}
            />
          ) : (
            <NoteBodyEditor
              markdown={draft.bodyMarkdown}
              onChange={setBody}
              embeds={embeds}
              today={today}
              onOpenTask={openTask}
              autoFocus={entity.type === 'page' && !entity.bodyMarkdown}
            />
          )}
        </>
      )}
    </ScrollView>
  );
};

export default NoteScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.surface },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[2],
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
  title: {
    ...font.bold,
    fontSize: tokens.text['2xl'],
    color: color.ink,
    paddingVertical: tokens.space[2],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[2],
    paddingBottom: tokens.space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.md,
    backgroundColor: color.fill,
  },
  chipText: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  addChip: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderStyle: 'dashed',
  },
  addText: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.accent,
  },
  error: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.alert,
  },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    textAlign: 'center',
    padding: tokens.space[6],
  },
});
