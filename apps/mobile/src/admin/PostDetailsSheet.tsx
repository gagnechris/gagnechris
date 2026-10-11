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
import { color } from '../theme';
import { Icon } from '../ui/Icon';
import { Row } from '../ui/Row';
import { Section } from '../ui/Section';
import {
  ChipsField,
  DetailsSheet,
  FieldHint,
  FieldLabel,
  ImageField,
  TextField,
} from './DetailsSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  draft: PostDraftFields;
  onChange: (update: (prev: PostDraftFields) => PostDraftFields) => void;
  /** Whether the slug still follows the title. */
  slugFollows: boolean;
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
  slugFollows,
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

  const toggleProject = (id: string) =>
    onChange((prev) => ({
      ...prev,
      projectIds: prev.projectIds.includes(id)
        ? prev.projectIds.filter((p) => p !== id)
        : [...prev.projectIds, id],
    }));

  return (
    <DetailsSheet visible={visible} onClose={onClose}>
      <TextField
        label="Slug"
        prefix="/posts/"
        value={draft.slug}
        maxLength={MAX_SLUG_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(slug) => {
          onSlugEdited();
          set('slug', slug);
        }}
      />
      {slugFollows && (
        <FieldHint>Follows the title until you edit it.</FieldHint>
      )}

      <ChipsField
        label="Tags"
        noun="tag"
        values={parsePostTags(draft.tagsText)}
        onChange={(tags) => set('tagsText', tags.join(', '))}
      />

      <TextField
        label="Excerpt"
        value={draft.excerpt}
        placeholder="Shown on the Posts page and in RSS"
        multiline
        onChangeText={(excerpt) => set('excerpt', excerpt)}
      />

      <ImageField
        label="Cover image"
        path={draft.coverImage}
        uploading={uploading}
        onChoose={onChooseCover}
        onRemove={() => set('coverImage', '')}
      />

      <FieldLabel>Part of project</FieldLabel>
      <FieldHint>
        Lists this post in the project’s Build log. Not the same as Tags.
      </FieldHint>
      {projectsError ? (
        <FieldHint>Could not load projects.</FieldHint>
      ) : !projects ? (
        <FieldHint>Loading projects…</FieldHint>
      ) : projects.length === 0 ? (
        <FieldHint>No projects yet.</FieldHint>
      ) : (
        <Section>
          {sortProjectsByOrder(projects).map((project, index) => {
            const on = draft.projectIds.includes(project.id);
            const stage = PROJECT_STAGE_LABELS[project.stage];
            return (
              <Row
                key={project.id}
                title={project.name}
                detail={stage}
                divider={index > 0}
                accessibilityLabel={`${project.name}, ${stage}${on ? ', selected' : ''}`}
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

      <TextField
        label="SEO title"
        value={draft.seoTitle}
        placeholder={draft.title}
        onChangeText={(value) => set('seoTitle', value)}
      />
      <TextField
        label="SEO description"
        value={draft.seoDescription}
        placeholder={draft.excerpt}
        multiline
        onChangeText={(value) => set('seoDescription', value)}
      />
      <FieldHint>
        Title and description default to the post title and excerpt.
      </FieldHint>
    </DetailsSheet>
  );
};
