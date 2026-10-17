import {
  emptyPostDraft,
  isPlaceholderSlug,
  slugWasPublished,
  postDraftFromPost,
  postPayload,
  postResource,
  useDeletePostMutation,
  useProjectsQuery,
  useVersionedEntityEditor,
} from '@gagnechris/app-core';
import { postLivePath } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { withSlugSource } from '../../../src/admin/draftEdits';
import {
  EditorHeaderButtons,
  PublishBar,
} from '../../../src/admin/EditorChrome';
import { MarkdownBodyField } from '../../../src/admin/MarkdownBodyField';
import { PostDetailsSheet } from '../../../src/admin/PostDetailsSheet';
import {
  DELETE_PROMPT,
  DISCARD_PROMPT,
  publishableConfirm,
  UNPUBLISH_PROMPT,
} from '../../../src/admin/publishableConfirm';
import {
  liveUrl,
  showPublishableMenu,
} from '../../../src/admin/publishableMenu';
import { usePhotoUpload } from '../../../src/admin/usePhotoUpload';
import { PUBLIC_SITE_ORIGIN } from '../../../src/markdown/links';
import { MarkdownView } from '../../../src/markdown/MarkdownView';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import { useSaveOnBackground } from '../../../src/notebook/useSaveOnBackground';
import { color, font, readingFont } from '../../../src/theme';

const confirm = publishableConfirm(
  'post',
  'It leaves the public Posts page, RSS and the sitemap.',
);

const PostScreen = () => {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useIsOnline();
  const deleteMutation = useDeletePostMutation();
  const projects = useProjectsQuery();
  const { uploading, addPhoto } = usePhotoUpload();
  const [preview, setPreview] = useState(false);
  const [details, setDetails] = useState(false);
  const [followSlug, setFollowSlug] = useState(false);

  const editor = useVersionedEntityEditor({
    resource: postResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyPostDraft(),
    toDraft: postDraftFromPost,
    getEntityId: (post) => post.id,
    toPayload: postPayload,
    conflictMessage:
      'Someone else changed this post. Go back and open it again.',
    slugTakenMessage: 'That slug is already taken. Choose a different slug.',
    loadErrorFallback: 'Could not load this post.',
    confirm,
    unpublishConfirm: UNPUBLISH_PROMPT,
    discardConfirm: DISCARD_PROMPT,
    retrySignals: nativeRetrySignals,
    onHydrate: (post) => setFollowSlug(isPlaceholderSlug(post.slug)),
    delete: {
      confirm: DELETE_PROMPT,
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id, version });
      },
      onDeleted: () => router.back(),
    },
  });
  const { draft, updateDraft, entity, dirty, save, actionBarProps } = editor;
  useSaveOnBackground(dirty, save);
  const slugFollows = followSlug && !slugWasPublished(entity);

  const setTitle = useCallback(
    (title: string) =>
      updateDraft((prev) => withSlugSource(prev, 'title', title, slugFollows)),
    [updateDraft, slugFollows],
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

  const ready = Boolean(!editor.isLoading && entity);

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
          headerRight: () => (
            <EditorHeaderButtons
              actionBar={actionBarProps}
              offline={!online}
              ready={ready}
              preview={preview}
              onTogglePreview={() => setPreview((on) => !on)}
              onDetails={() => setDetails(true)}
              menuLabel="Post actions"
              onMenu={() =>
                showPublishableMenu({
                  liveUrl: liveUrl(entity && postLivePath(entity)),
                  published: entity?.status === 'published',
                  hasUnpublishedChanges: actionBarProps.hasUnpublishedChanges,
                  onDiscard: actionBarProps.onDiscard,
                  onUnpublish: actionBarProps.onUnpublish,
                  onDelete: () => void editor.runDelete(),
                })
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
      {!ready || !entity ? (
        <Text style={styles.status}>Loading post…</Text>
      ) : (
        <>
          <PublishBar actionBar={actionBarProps} offline={!online} />
          <TextInput
            style={styles.title}
            accessibilityLabel="Title"
            placeholder="Untitled"
            placeholderTextColor={color.muted}
            value={draft.title}
            onChangeText={setTitle}
            editable={!preview}
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
          />
          {preview ? (
            <MarkdownView
              markdown={draft.bodyMarkdown}
              siteOrigin={PUBLIC_SITE_ORIGIN}
            />
          ) : (
            <MarkdownBodyField
              value={draft.bodyMarkdown}
              onChange={setBody}
              addPhoto={addPhoto}
              uploading={uploading}
              onPreview={() => setPreview(true)}
              siteOrigin={PUBLIC_SITE_ORIGIN}
              autoFocus={!entity.bodyMarkdown}
            />
          )}
          <PostDetailsSheet
            visible={details}
            onClose={() => setDetails(false)}
            draft={draft}
            onChange={updateDraft}
            slugFollows={slugFollows}
            onSlugEdited={() => setFollowSlug(false)}
            onChooseCover={() =>
              void addPhoto((path) =>
                updateDraft((prev) => ({ ...prev, coverImage: path })),
              )
            }
            uploading={uploading}
            projects={projects.data}
            projectsError={projects.isError}
          />
        </>
      )}
    </ScrollView>
  );
};

export default PostScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.surface },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[2],
  },
  title: {
    ...readingFont.medium,
    fontSize: 32,
    lineHeight: 40,
    color: color.ink,
    paddingVertical: tokens.space[2],
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
