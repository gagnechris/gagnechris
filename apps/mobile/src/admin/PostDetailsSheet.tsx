import {
  parsePostTags,
  type PostDraftFields,
  type Project,
} from '@gagnechris/app-core';
import {
  MAX_SLUG_LENGTH,
  PROJECT_STAGE_LABELS,
  sortProjectsByOrder,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { confirmAction } from '../ui/confirm';
import { Icon } from '../ui/Icon';
import { Row } from '../ui/Row';
import { Section } from '../ui/Section';
import { PUBLIC_SITE_ORIGIN, resolveMarkdownUrl } from '../markdown/links';

type Props = {
  visible: boolean;
  onClose: () => void;
  draft: PostDraftFields;
  onChange: (update: (prev: PostDraftFields) => PostDraftFields) => void;
  onSlugEdited: () => void;
  onChooseCover: () => void;
  uploading: boolean;
  projects: readonly Project[] | undefined;
  projectsError: boolean;
};

export const PostDetailsSheet = ({
  visible,
  onClose,
  draft,
  onChange,
  onSlugEdited,
  onChooseCover,
  uploading,
  projects,
  projectsError,
}: Props) => {
  const set = <K extends keyof PostDraftFields>(
    key: K,
    value: PostDraftFields[K],
  ) => onChange((prev) => ({ ...prev, [key]: value }));
  const tags = parsePostTags(draft.tagsText);
  const cover = draft.coverImage
    ? resolveMarkdownUrl(draft.coverImage, PUBLIC_SITE_ORIGIN)
    : null;

  const addTag = () =>
    Alert.prompt('Add a tag', undefined, (value) => {
      const tag = value?.trim().replace(/,/g, '');
      if (!tag || tags.includes(tag)) return;
      set('tagsText', [...tags, tag].join(', '));
    });

  const removeTag = async (tag: string) => {
    if (await confirmAction(`Remove “${tag}”?`, '', 'Remove')) {
      set('tagsText', tags.filter((t) => t !== tag).join(', '));
    }
  };

  const toggleProject = (id: string) =>
    onChange((prev) => ({
      ...prev,
      projectIds: prev.projectIds.includes(id)
        ? prev.projectIds.filter((p) => p !== id)
        : [...prev.projectIds, id],
    }));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.bar}>
          <Text style={styles.heading} accessibilityRole="header">
            Details
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={onClose}
            style={styles.done}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Slug</Text>
          <View style={styles.prefixed}>
            <Text style={styles.prefix}>/posts/</Text>
            <TextInput
              accessibilityLabel="Slug"
              value={draft.slug}
              maxLength={MAX_SLUG_LENGTH}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(slug) => {
                onSlugEdited();
                set('slug', slug);
              }}
              style={[styles.input, styles.prefixedInput]}
            />
          </View>
          <Text style={styles.hint}>Follows the title until you edit it.</Text>

          <Text style={styles.label}>Tags</Text>
          <View style={styles.chips}>
            {tags.map((tag) => (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityLabel={`Tag ${tag}`}
                accessibilityHint="Removes the tag"
                onPress={() => void removeTag(tag)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{tag}</Text>
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

          <Text style={styles.label}>Excerpt</Text>
          <TextInput
            accessibilityLabel="Excerpt"
            value={draft.excerpt}
            placeholder="Shown on the Posts page and in RSS"
            placeholderTextColor={color.muted}
            multiline
            scrollEnabled={false}
            onChangeText={(excerpt) => set('excerpt', excerpt)}
            style={[styles.input, styles.multiline]}
          />

          <Text style={styles.label}>Cover image</Text>
          {cover ? (
            <Image
              accessibilityLabel="Cover image"
              accessibilityIgnoresInvertColors
              source={{ uri: cover }}
              resizeMode="cover"
              style={styles.cover}
            />
          ) : null}
          <Section>
            <Row
              title={
                uploading
                  ? 'Uploading photo…'
                  : cover
                    ? 'Choose another photo'
                    : 'Choose a photo'
              }
              leading={<Icon name="photo" color={color.accent} />}
              onPress={uploading ? undefined : onChooseCover}
            />
            {cover ? (
              <Row
                title="Remove cover image"
                destructive
                divider
                onPress={() => set('coverImage', '')}
              />
            ) : null}
          </Section>

          <Text style={styles.label}>Part of project</Text>
          <Text style={styles.hint}>
            Lists this post in the project’s Build log. Not the same as Tags.
          </Text>
          {projectsError ? (
            <Text style={styles.hint}>Could not load projects.</Text>
          ) : !projects ? (
            <Text style={styles.hint}>Loading projects…</Text>
          ) : projects.length === 0 ? (
            <Text style={styles.hint}>No projects yet.</Text>
          ) : (
            <Section>
              {sortProjectsByOrder(projects).map((project, index) => {
                const on = draft.projectIds.includes(project.id);
                return (
                  <Row
                    key={project.id}
                    title={project.name}
                    detail={PROJECT_STAGE_LABELS[project.stage]}
                    divider={index > 0}
                    accessibilityLabel={`${project.name}, ${PROJECT_STAGE_LABELS[project.stage]}${on ? ', selected' : ''}`}
                    trailing={
                      on ? (
                        <Icon name="checkmark" size={18} color={color.accent} />
                      ) : null
                    }
                    onPress={() => toggleProject(project.id)}
                  />
                );
              })}
            </Section>
          )}

          <Text style={styles.label}>SEO title</Text>
          <TextInput
            accessibilityLabel="SEO title"
            value={draft.seoTitle}
            placeholder={draft.title}
            placeholderTextColor={color.muted}
            onChangeText={(value) => set('seoTitle', value)}
            style={styles.input}
          />
          <Text style={styles.label}>SEO description</Text>
          <TextInput
            accessibilityLabel="SEO description"
            value={draft.seoDescription}
            placeholder={draft.excerpt}
            placeholderTextColor={color.muted}
            multiline
            scrollEnabled={false}
            onChangeText={(value) => set('seoDescription', value)}
            style={[styles.input, styles.multiline]}
          />
          <Text style={styles.hint}>
            Title and description default to the post title and excerpt.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  heading: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
  done: {
    minHeight: MIN_TARGET,
    minWidth: MIN_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  doneText: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.accent,
  },
  content: {
    padding: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[2],
  },
  label: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    paddingTop: tokens.space[3],
  },
  hint: { ...font.regular, fontSize: tokens.text.caption, color: color.muted },
  input: {
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
    backgroundColor: color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    minHeight: MIN_TARGET,
  },
  multiline: { minHeight: MIN_TARGET * 2, textAlignVertical: 'top' },
  prefixed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
  },
  prefix: { ...font.regular, fontSize: tokens.text.body, color: color.muted },
  prefixedInput: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TARGET,
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
  cover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: tokens.radius.md,
    backgroundColor: color.fill,
  },
});
