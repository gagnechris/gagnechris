import {
  noteResource,
  useDeleteNoteMutation,
  useLatest,
  useNoteTaskEmbedSync,
  useVersionedDocEditor,
} from '@gagnechris/app-core';
import {
  emptyNoteDraft,
  NOTEBOOK_AREA_LABELS,
  noteDraftFromNote,
  notePayloadFromDraft,
  noteTitle,
  parseTagsText,
  removeTaskEmbedLines,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MarkdownView } from '../../../src/markdown/MarkdownView';
import { nativeRetrySignals } from '../../../src/net';
import {
  DetailEditorShell,
  detailEditorRoute,
  detailStyles,
  type DetailScreenProps,
} from '../../../src/notebook/DetailEditorShell';
import { useDetailRoutes } from '../../../src/notebook/detailRoutes';
import { NoteBodyEditor } from '../../../src/notebook/NoteBodyEditor';
import {
  deleteNoteMessage,
  deleteNoteTitle,
} from '../../../src/notebook/noteActions';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { confirmAction, nativeConfirm } from '../../../src/ui/confirm';
import { Icon } from '../../../src/ui/Icon';
import { TaskEmbedRow } from '../../../src/ui/TaskEmbedRow';

const DELETE_PROMPT = 'delete-note';

const NoteScreen = ({ id, onReload }: DetailScreenProps) => {
  const router = useRouter();
  const routes = useDetailRoutes();
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
  const { draft, updateDraft, entity } = editor;

  const noteType: { readonly current: 'daily' | 'page' } = useLatest(
    entity?.type ?? 'page',
  );

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
    markdown: draft.bodyMarkdown,
    note: embedNote,
    today,
    removeEmbeds: removeDeletedEmbeds,
  });
  const { openTask } = routes;

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
      updateDraft((prev) => {
        const tags = parseTagsText(prev.tagsText);
        return tags.includes(tag)
          ? prev
          : { ...prev, tagsText: [...tags, tag].join(', ') };
      });
    });

  const removeTag = async (tag: string) => {
    if (await confirmAction(`Remove “${tag}”?`, '', 'Remove')) {
      updateDraft((prev) => ({
        ...prev,
        tagsText: parseTagsText(prev.tagsText)
          .filter((t) => t !== tag)
          .join(', '),
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

  return (
    <DetailEditorShell
      editor={editor}
      conflictId={id}
      onReload={onReload}
      openPath={routes.notePath}
      loadingText="Loading note…"
      menuLabel="Note actions"
      onMenu={showMenu}
      headerLargeTitleEnabled={false}
      headerActions={(ready) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Preview"
          accessibilityState={{ selected: preview }}
          onPress={() => setPreview((on) => !on)}
          style={detailStyles.headerButton}
          disabled={!ready}
        >
          <Icon
            name={preview ? 'eye.fill' : 'eye'}
            color={preview ? color.accent : color.ink}
          />
        </Pressable>
      )}
      backgroundColor={color.surface}
      contentStyle={styles.content}
    >
      {(note) => (
        <>
          <TextInput
            style={styles.title}
            accessibilityLabel="Title"
            placeholder="Untitled"
            placeholderTextColor={color.muted}
            value={note.type === 'daily' ? noteTitle(note) : draft.title}
            onChangeText={setTitle}
            editable={note.type === 'page' && !preview}
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
          />
          <View style={styles.chips}>
            <View
              style={styles.chip}
              accessible
              accessibilityLabel={`Area: ${NOTEBOOK_AREA_LABELS[note.area]}`}
            >
              <Text style={styles.chipText}>
                {NOTEBOOK_AREA_LABELS[note.area]}
              </Text>
            </View>
            {draft.pinned ? (
              <View style={styles.chip} accessible accessibilityLabel="Pinned">
                <Icon name="pin.fill" size={12} color={color.inkSoft} />
              </View>
            ) : null}
            {parseTagsText(draft.tagsText).map((tag) => (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={`Tag ${tag}`}
                accessibilityHint="Removes the tag"
                onPress={() => void removeTag(tag)}
                hitSlop={CHIP_SLOP}
                style={styles.chip}
              >
                <Text style={styles.chipText}>#{tag}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add tag"
              onPress={addTag}
              hitSlop={CHIP_SLOP}
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
              autoFocus={note.type === 'page' && !note.bodyMarkdown}
            />
          )}
        </>
      )}
    </DetailEditorShell>
  );
};

export default detailEditorRoute(NoteScreen);

const CHIP_HEIGHT = 32;
// Tag chips stay compact; the slop makes each a 44pt target.
const CHIP_SLOP = (MIN_TARGET - CHIP_HEIGHT) / 2;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[2],
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
    minHeight: CHIP_HEIGHT,
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
});
