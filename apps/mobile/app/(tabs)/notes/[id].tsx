import { noteResource, useVersionedDocEditor } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import {
  emptyNoteDraft,
  noteDraftFromNote,
  notePayloadFromDraft,
} from '../../../src/notebook/noteDraft';
import { saveLabel } from '../../../src/notebook/saveLabel';
import { color, font } from '../../../src/theme';
import { nativeConfirm } from '../../../src/ui/confirm';

const NoteScreen = () => {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const online = useIsOnline();

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
    confirm: nativeConfirm,
    retrySignals: nativeRetrySignals,
  });
  const { draft, updateDraft, entity, dirty, saveState } = editor;

  const setTitle = useCallback(
    (title: string) => updateDraft((prev) => ({ ...prev, title })),
    [updateDraft],
  );
  const setBody = useCallback(
    (bodyMarkdown: string) =>
      updateDraft((prev) => ({ ...prev, bodyMarkdown })),
    [updateDraft],
  );

  if (editor.loadError) {
    return (
      <Text style={styles.status} accessibilityRole="alert">
        {editor.loadError}
      </Text>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: '',
          headerLargeTitleEnabled: false,
          headerRight: () => (
            <Text
              style={styles.saveState}
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
            >
              {saveLabel(saveState, dirty, !online)}
            </Text>
          ),
        }}
      />
      {editor.saveError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {editor.saveError}
        </Text>
      ) : null}
      <EditorOfflineNotice dirty={dirty} />
      {editor.isLoading || !entity ? (
        <Text style={styles.status}>Loading note…</Text>
      ) : (
        <>
          <TextInput
            style={styles.title}
            accessibilityLabel="Title"
            placeholder="Untitled"
            placeholderTextColor={color.muted}
            value={draft.title}
            onChangeText={setTitle}
            editable={entity.type === 'page'}
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
          />
          <TextInput
            style={styles.body}
            accessibilityLabel="Note body"
            placeholder="Write in markdown…"
            placeholderTextColor={color.muted}
            value={draft.bodyMarkdown}
            onChangeText={setBody}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            autoFocus={entity.type === 'page' && !entity.bodyMarkdown}
          />
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
  body: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: 24,
    color: color.ink,
    minHeight: 240,
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
