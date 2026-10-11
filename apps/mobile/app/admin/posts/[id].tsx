import {
  emptyPostDraft,
  isPlaceholderSlug,
  postDraftFromPost,
  postPayload,
  postResource,
  useDeletePostMutation,
  useGetApiClient,
  useLatest,
  useProjectsQuery,
  useVersionedEntityEditor,
} from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { openBrowserAsync } from 'expo-web-browser';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ImageUploadError,
  pickImage,
  uploadImage,
} from '../../../src/admin/imageUpload';
import { PostDetailsSheet } from '../../../src/admin/PostDetailsSheet';
import { insertImage, withTitle } from '../../../src/admin/postEdits';
import { postStatusLabel } from '../../../src/admin/postLabels';
import { PUBLIC_SITE_ORIGIN } from '../../../src/markdown/links';
import { MarkdownView } from '../../../src/markdown/MarkdownView';
import {
  EditorOfflineNotice,
  nativeRetrySignals,
  useIsOnline,
} from '../../../src/net';
import {
  NoteKeyboardToolbar,
  type ToolbarButton,
} from '../../../src/notebook/NoteKeyboardToolbar';
import { saveLabel } from '../../../src/notebook/saveLabel';
import {
  applyToolbarAction,
  type Selection,
} from '../../../src/notebook/toolbarEdits';
import { useSaveOnBackground } from '../../../src/notebook/useSaveOnBackground';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import {
  confirmAction,
  nativeConfirm,
  showError,
} from '../../../src/ui/confirm';
import { Icon } from '../../../src/ui/Icon';

const TOOLBAR_ID = 'post-keyboard-toolbar';

type PostAction = 'heading' | 'list' | 'link' | 'image';

const BUTTONS: readonly ToolbarButton<PostAction>[] = [
  { action: 'heading', label: 'Heading', text: 'H' },
  { action: 'list', label: 'List', icon: 'list.bullet' },
  { action: 'link', label: 'Link', icon: 'link' },
  { action: 'image', label: 'Photo', icon: 'photo' },
];

const UNPUBLISH = 'unpublish-post';
const DISCARD = 'discard-post';
const DELETE = 'delete-post';

const confirmPrompt = (message: string): Promise<boolean> => {
  switch (message) {
    case UNPUBLISH:
      return confirmAction(
        'Unpublish this post?',
        'It leaves the public Posts page, RSS and the sitemap.',
        'Unpublish',
      );
    case DISCARD:
      return confirmAction(
        'Discard unpublished changes?',
        'The post goes back to what’s published.',
        'Discard',
      );
    case DELETE:
      return confirmAction(
        'Delete this post?',
        'It leaves the admin. Only the API can bring it back.',
        'Delete',
      );
    default:
      return nativeConfirm(message);
  }
};

const uploadFailure = (err: unknown) =>
  showError(
    'Could not add the photo',
    err instanceof ImageUploadError
      ? err.message
      : 'Check your connection and try again.',
  );

const PostScreen = () => {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useIsOnline();
  const getClient = useGetApiClient();
  const deleteMutation = useDeletePostMutation();
  const projects = useProjectsQuery();
  const [preview, setPreview] = useState(false);
  const [details, setDetails] = useState(false);
  const [followSlug, setFollowSlug] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });

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
    confirm: confirmPrompt,
    unpublishConfirm: UNPUBLISH,
    discardConfirm: DISCARD,
    retrySignals: nativeRetrySignals,
    onHydrate: (post) => setFollowSlug(isPlaceholderSlug(post.slug)),
    delete: {
      confirm: DELETE,
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id, version });
      },
      onDeleted: () => router.back(),
    },
  });
  const { draft, updateDraft, entity, dirty, saveState, save, actionBarProps } =
    editor;
  useSaveOnBackground(dirty, save);
  // The upload can finish after more typing; the photo goes into the text as it is then.
  const body = useLatest(draft.bodyMarkdown);

  const setTitle = useCallback(
    (title: string) =>
      updateDraft((prev) => withTitle(prev, title, followSlug)),
    [updateDraft, followSlug],
  );
  const setBody = useCallback(
    (bodyMarkdown: string) =>
      updateDraft((prev) => ({ ...prev, bodyMarkdown })),
    [updateDraft],
  );

  const addPhoto = async (place: (path: string, alt: string) => void) => {
    try {
      const image = await pickImage();
      if (!image) return;
      setUploading(true);
      place(await uploadImage(getClient(), image), image.alt);
    } catch (err) {
      uploadFailure(err);
    } finally {
      setUploading(false);
    }
  };

  const onAction = (action: PostAction) => {
    if (action === 'image') {
      const at = selection;
      void addPhoto((path, alt) => {
        const edit = insertImage(body.current, at, alt, path);
        setBody(edit.text);
        setSelection(edit.selection);
      });
      return;
    }
    const edit = applyToolbarAction(draft.bodyMarkdown, selection, action);
    setBody(edit.text);
    setSelection(edit.selection);
  };

  const published = entity?.status === 'published';
  const liveUrl = entity ? `${PUBLIC_SITE_ORIGIN}/posts/${entity.slug}` : '';
  const canPublish =
    !published || actionBarProps.hasUnpublishedChanges || dirty;

  const showMenu = () => {
    const items: { label: string; run: () => void; destructive?: boolean }[] =
      [];
    if (published) {
      items.push(
        { label: 'View on site', run: () => void openBrowserAsync(liveUrl) },
        { label: 'Share link', run: () => void Share.share({ url: liveUrl }) },
      );
      if (actionBarProps.hasUnpublishedChanges) {
        items.push({
          label: 'Discard unpublished changes',
          run: actionBarProps.onDiscard,
        });
      }
      items.push({ label: 'Unpublish', run: actionBarProps.onUnpublish });
    }
    items.push({
      label: 'Delete',
      run: () => void editor.runDelete(),
      destructive: true,
    });
    const options = [...items.map((item) => item.label), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex: items.findIndex((item) => item.destructive),
        cancelButtonIndex: items.length,
      },
      (index) => items[index]?.run(),
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
          headerRight: () => (
            <View style={styles.headerRight}>
              <Text style={styles.saveState} accessibilityLiveRegion="polite">
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
                accessibilityLabel="Details"
                onPress={() => setDetails(true)}
                style={styles.headerButton}
                disabled={!ready}
              >
                <Icon name="slider.horizontal.3" color={color.ink} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post actions"
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
        <Text style={styles.status}>Loading post…</Text>
      ) : (
        <>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>
              {postStatusLabel(actionBarProps)}
            </Text>
            {canPublish ? (
              <Button
                title={published ? 'Publish changes' : 'Publish'}
                disabled={actionBarProps.busy || !online}
                onPress={actionBarProps.onPublish}
              />
            ) : null}
          </View>
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
            <>
              <TextInput
                accessibilityLabel="Body"
                multiline
                scrollEnabled={false}
                value={draft.bodyMarkdown}
                onChangeText={setBody}
                selection={selection}
                onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                inputAccessoryViewID={TOOLBAR_ID}
                placeholder="Write in Markdown…"
                placeholderTextColor={color.muted}
                autoFocus={!entity.bodyMarkdown}
                style={styles.body}
              />
              {uploading ? (
                <Text style={styles.saveState} accessibilityLiveRegion="polite">
                  Uploading photo…
                </Text>
              ) : null}
              <NoteKeyboardToolbar
                nativeID={TOOLBAR_ID}
                buttons={BUTTONS}
                onAction={onAction}
              />
            </>
          )}
          <PostDetailsSheet
            visible={details}
            onClose={() => setDetails(false)}
            draft={draft}
            onChange={updateDraft}
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
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[2],
    paddingTop: tokens.space[2],
  },
  statusLabel: {
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
