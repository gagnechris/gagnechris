import {
  emptyHomeDraft,
  homeDraftFromHome,
  homePayload,
  homeResource,
  useVersionedEntityEditor,
  type HomeDraftFields,
} from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { FieldHint, TextField } from '../../../src/admin/DetailsSheet';
import {
  EditorHeaderButtons,
  PublishBar,
} from '../../../src/admin/EditorChrome';
import {
  DISCARD_PROMPT,
  publishableConfirm,
  UNPUBLISH_PROMPT,
} from '../../../src/admin/publishableConfirm';
import { showPublishableMenu } from '../../../src/admin/publishableMenu';
import { PUBLIC_SITE_ORIGIN } from '../../../src/markdown/links';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import { useSaveOnBackground } from '../../../src/notebook/useSaveOnBackground';
import { color, font } from '../../../src/theme';

const confirm = publishableConfirm(
  'home page',
  'The live page keeps the last published version.',
);

const HomePageScreen = () => {
  const online = useIsOnline();
  const editor = useVersionedEntityEditor({
    resource: homeResource,
    params: {},
    initialDraft: emptyHomeDraft(),
    toDraft: homeDraftFromHome,
    getEntityId: () => 'home',
    toPayload: homePayload,
    conflictMessage:
      'Someone else changed the home page. Go back and open it again.',
    loadErrorFallback: 'Could not load the home page.',
    confirm,
    unpublishConfirm: UNPUBLISH_PROMPT,
    discardConfirm: DISCARD_PROMPT,
    retrySignals: nativeRetrySignals,
  });
  const { draft, updateDraft, entity, dirty, save, actionBarProps } = editor;
  useSaveOnBackground(dirty, save);

  const set =
    <K extends keyof HomeDraftFields>(key: K) =>
    (value: HomeDraftFields[K]) =>
      updateDraft((prev) => ({ ...prev, [key]: value }));

  if (editor.loadError) {
    return (
      <Text style={styles.status} accessibilityRole="alert">
        {editor.loadError}
      </Text>
    );
  }

  const ready = Boolean(!editor.isLoading && entity);
  const published = entity?.status === 'published';

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
          headerRight: () => (
            <EditorHeaderButtons
              actionBar={actionBarProps}
              offline={!online}
              ready={ready}
              menuLabel="Home page actions"
              onMenu={
                published
                  ? () =>
                      showPublishableMenu({
                        liveUrl: `${PUBLIC_SITE_ORIGIN}/`,
                        hasUnpublishedChanges:
                          actionBarProps.hasUnpublishedChanges,
                        onDiscard: actionBarProps.onDiscard,
                        onUnpublish: actionBarProps.onUnpublish,
                      })
                  : undefined
              }
            />
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
        <Text style={styles.status}>Loading the home page…</Text>
      ) : (
        <>
          <PublishBar actionBar={actionBarProps} offline={!online} />
          <TextField
            label="Name"
            value={draft.name}
            onChangeText={set('name')}
          />
          <TextField
            label="Title"
            value={draft.title}
            onChangeText={set('title')}
          />
          <TextField
            label="About me"
            value={draft.about}
            multiline
            onChangeText={set('about')}
          />
          <FieldHint>Blank lines start a new paragraph.</FieldHint>
          <Text style={styles.section} accessibilityRole="header">
            Search and sharing
          </Text>
          <TextField
            label="SEO title"
            value={draft.seoTitle}
            placeholder={`${draft.name} - ${draft.title}`}
            onChangeText={set('seoTitle')}
          />
          <TextField
            label="SEO description"
            value={draft.seoDescription}
            multiline
            onChangeText={set('seoDescription')}
          />
          <FieldHint>
            The description defaults to the first 200 characters of About me.
          </FieldHint>
        </>
      )}
    </ScrollView>
  );
};

export default HomePageScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.surface },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[2],
  },
  section: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.ink,
    paddingTop: tokens.space[4],
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
