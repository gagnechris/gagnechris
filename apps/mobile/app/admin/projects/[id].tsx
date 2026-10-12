import {
  emptyProjectDraft,
  hasProjectDraftErrors,
  hasProjectPublishErrors,
  isPlaceholderSlug,
  slugWasPublished,
  projectDraftFromProject,
  projectPayload,
  projectResource,
  useDeleteProjectMutation,
  useVersionedEntityEditor,
  type ProjectDraftFields,
} from '@gagnechris/app-core';
import { projectPagePath, PROJECT_NAME_MAX_LENGTH } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { withSlugSource } from '../../../src/admin/draftEdits';
import {
  EditorHeaderButtons,
  PublishBar,
} from '../../../src/admin/EditorChrome';
import { MarkdownBodyField } from '../../../src/admin/MarkdownBodyField';
import { ProjectDetailsSheet } from '../../../src/admin/ProjectDetailsSheet';
import {
  DELETE_PROMPT,
  DISCARD_PROMPT,
  publishableConfirm,
  UNPUBLISH_PROMPT,
} from '../../../src/admin/publishableConfirm';
import { showPublishableMenu } from '../../../src/admin/publishableMenu';
import { usePhotoUpload } from '../../../src/admin/usePhotoUpload';
import { PUBLIC_SITE_ORIGIN } from '../../../src/markdown/links';
import { MarkdownView } from '../../../src/markdown/MarkdownView';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import { useSaveOnBackground } from '../../../src/notebook/useSaveOnBackground';
import { color, font } from '../../../src/theme';

const confirm = publishableConfirm(
  'project',
  'It leaves the public Projects page and the sitemap.',
);

const ProjectScreen = () => {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useIsOnline();
  const deleteMutation = useDeleteProjectMutation();
  const { uploading, addPhoto } = usePhotoUpload();
  const [preview, setPreview] = useState(false);
  const [details, setDetails] = useState(false);
  const [followSlug, setFollowSlug] = useState(false);
  const draftRef = useRef<ProjectDraftFields | null>(null);

  const editor = useVersionedEntityEditor({
    resource: projectResource,
    params: { id },
    enabled: Boolean(id),
    initialDraft: emptyProjectDraft(),
    toDraft: projectDraftFromProject,
    getEntityId: (project) => project.id,
    toPayload: projectPayload,
    conflictMessage:
      'Someone else changed this project. Go back and open it again.',
    slugTakenMessage: 'That slug is already taken. Choose a different slug.',
    loadErrorFallback: 'Could not load this project.',
    confirm,
    unpublishConfirm: UNPUBLISH_PROMPT,
    discardConfirm: DISCARD_PROMPT,
    retrySignals: nativeRetrySignals,
    onHydrate: (project) => setFollowSlug(isPlaceholderSlug(project.slug)),
    beforePublish: () =>
      draftRef.current && hasProjectPublishErrors(draftRef.current)
        ? 'Not published: fix the fields marked in Details first.'
        : true,
    delete: {
      confirm: DELETE_PROMPT,
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id, version });
      },
      onDeleted: () => router.back(),
    },
  });
  const { draft, updateDraft, entity, dirty, save, actionBarProps } = editor;
  useEffect(() => {
    draftRef.current = draft;
  });
  useSaveOnBackground(dirty, save);
  const slugFollows = followSlug && !slugWasPublished(entity);

  const setName = useCallback(
    (name: string) =>
      updateDraft((prev) => withSlugSource(prev, 'name', name, slugFollows)),
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
  // Invalid fields save as their last saved values, so a clean save does not
  // mean everything typed is on the server.
  const actionBar = {
    ...actionBarProps,
    dirty: actionBarProps.dirty || hasProjectDraftErrors(draft),
  };

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
              actionBar={actionBar}
              offline={!online}
              ready={ready}
              preview={preview}
              onTogglePreview={() => setPreview((on) => !on)}
              onDetails={() => setDetails(true)}
              menuLabel="Project actions"
              onMenu={() =>
                showPublishableMenu({
                  liveUrl:
                    entity?.status === 'published'
                      ? `${PUBLIC_SITE_ORIGIN}${entity.href ?? projectPagePath(entity.slug)}`
                      : null,
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
        <Text style={styles.status}>Loading project…</Text>
      ) : (
        <>
          <PublishBar actionBar={actionBar} offline={!online} />
          <TextInput
            style={styles.title}
            accessibilityLabel="Name"
            placeholder="Untitled project"
            placeholderTextColor={color.muted}
            value={draft.name}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            onChangeText={setName}
            editable={!preview}
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
          />
          {draft.pitch ? <Text style={styles.pitch}>{draft.pitch}</Text> : null}
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
            />
          )}
          <ProjectDetailsSheet
            visible={details}
            onClose={() => setDetails(false)}
            draft={draft}
            onChange={updateDraft}
            onSlugEdited={() => setFollowSlug(false)}
            onChoosePreview={() =>
              void addPhoto((path) =>
                updateDraft((prev) => ({ ...prev, previewImage: path })),
              )
            }
            uploading={uploading}
          />
        </>
      )}
    </ScrollView>
  );
};

export default ProjectScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.surface },
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
  pitch: {
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.inkSoft,
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
