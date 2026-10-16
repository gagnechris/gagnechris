import {
  emptyProjectLink,
  projectHrefError,
  projectLinkErrors,
  projectOrderError,
  projectPreviewImageError,
  type ProjectDraftFields,
  type ProjectLinkDraft,
} from '@gagnechris/app-core';
import {
  LINK_HREF_MAX_LENGTH,
  MAX_SLUG_LENGTH,
  PROJECT_DEMO_IDS,
  PROJECT_LINK_LABEL_MAX_LENGTH,
  PROJECT_PITCH_MAX_LENGTH,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_NOTE_MAX_LENGTH,
  projectHasPage,
  projectPagePath,
  type ProjectDemo,
  type ProjectStage,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { StyleSheet, View } from 'react-native';
import { color } from '../theme';
import { Icon } from '../ui/Icon';
import { ListRow } from '../ui/ListRow';
import { Section } from '../ui/Section';
import { SegmentedRadio, segmentOptions } from '../ui/SegmentedRadio';
import {
  ChipsField,
  DetailsSheet,
  FieldHint,
  FieldLabel,
  ImageField,
  TextField,
} from './DetailsSheet';

const STAGES = Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[];
const DEMOS = ['none', ...PROJECT_DEMO_IDS] as const;
type DemoOption = (typeof DEMOS)[number];
const DEMO_LABELS: Record<DemoOption, string> = {
  none: 'None',
  posts: 'Posts',
  notebook: 'Notebook',
};

const pageHint = (draft: ProjectDraftFields): string => {
  const href = draft.href.trim();
  const page = projectPagePath(draft.slug.trim() || '…');
  if (href && !projectHrefError(href)) {
    return `No project page: the card links to ${href}`;
  }
  if (!projectHasPage({ ...draft, href: null })) {
    return `No page yet: an idea with no body is listed without a link. Page: ${page}`;
  }
  return `Page: ${page}`;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  draft: ProjectDraftFields;
  onChange: (update: (prev: ProjectDraftFields) => ProjectDraftFields) => void;
  onSlugEdited: () => void;
  onChoosePreview: () => void;
  uploading: boolean;
};

export const ProjectDetailsSheet = ({
  visible,
  onClose,
  draft,
  onChange,
  onSlugEdited,
  onChoosePreview,
  uploading,
}: Props) => {
  const set = <K extends keyof ProjectDraftFields>(
    key: K,
    value: ProjectDraftFields[K],
  ) => onChange((prev) => ({ ...prev, [key]: value }));
  const setLink = (id: string, fields: Partial<ProjectLinkDraft>) =>
    onChange((prev) => ({
      ...prev,
      links: prev.links.map((link) =>
        link.id === id ? { ...link, ...fields } : link,
      ),
    }));

  return (
    <DetailsSheet visible={visible} onClose={onClose}>
      <TextField
        label="Slug"
        prefix="/projects/"
        value={draft.slug}
        maxLength={MAX_SLUG_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(slug) => {
          onSlugEdited();
          set('slug', slug);
        }}
      />
      <FieldHint>{pageHint(draft)}</FieldHint>

      <TextField
        label="Pitch"
        value={draft.pitch}
        maxLength={PROJECT_PITCH_MAX_LENGTH}
        multiline
        onChangeText={(pitch) => set('pitch', pitch)}
      />
      <FieldHint>One line, shown on Home and Projects.</FieldHint>

      <FieldLabel>Stage</FieldLabel>
      <SegmentedRadio
        label="Stage"
        options={segmentOptions(STAGES, PROJECT_STAGE_LABELS)}
        value={draft.stage}
        onChange={(stage) => set('stage', stage)}
      />
      <TextField
        label="Stage note"
        value={draft.stageNote}
        maxLength={PROJECT_STAGE_NOTE_MAX_LENGTH}
        placeholder="Optional, e.g. “for fun” or “since 2026”"
        onChangeText={(note) => set('stageNote', note)}
      />

      <ImageField
        label="Preview image"
        path={draft.previewImage}
        uploading={uploading}
        onChoose={onChoosePreview}
        onRemove={() => set('previewImage', '')}
        hint="Shown on the project card."
        error={projectPreviewImageError(draft)}
      />

      <ChipsField
        label="Stack"
        noun="technology"
        values={draft.stack}
        onChange={(stack) => set('stack', stack)}
      />

      <FieldLabel>Demo</FieldLabel>
      <SegmentedRadio
        label="Demo"
        options={segmentOptions(DEMOS, DEMO_LABELS)}
        value={draft.demo || 'none'}
        onChange={(demo) =>
          set('demo', demo === 'none' ? '' : (demo as ProjectDemo))
        }
      />

      <TextField
        label="Order"
        value={draft.orderText}
        keyboardType="number-pad"
        onChangeText={(order) => set('orderText', order)}
        error={projectOrderError(draft.orderText)}
      />
      <FieldHint>Lower numbers are listed first.</FieldHint>

      <TextField
        label="Link card to…"
        value={draft.href}
        maxLength={LINK_HREF_MAX_LENGTH}
        placeholder="/dont-feed-the-bears or https://…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={(href) => set('href', href)}
        error={projectHrefError(draft.href)}
      />
      <FieldHint>
        Optional. When set, the project card links here and replaces the project
        page.
      </FieldHint>

      <FieldLabel>Links</FieldLabel>
      {draft.links.map((link, index) => {
        const errors = projectLinkErrors(link);
        const n = index + 1;
        return (
          <View key={link.id} style={styles.link}>
            <TextField
              label={`Link ${n} label`}
              value={link.label}
              maxLength={PROJECT_LINK_LABEL_MAX_LENGTH}
              onChangeText={(label) => setLink(link.id, { label })}
              error={errors.label}
            />
            <TextField
              label={`Link ${n} URL`}
              value={link.url}
              maxLength={LINK_HREF_MAX_LENGTH}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(url) => setLink(link.id, { url })}
              error={errors.url}
            />
            <Section>
              <ListRow
                title={`Remove link ${n}`}
                destructive
                onPress={() =>
                  onChange((prev) => ({
                    ...prev,
                    links: prev.links.filter((l) => l.id !== link.id),
                  }))
                }
              />
            </Section>
          </View>
        );
      })}
      <Section>
        <ListRow
          title="Add link"
          leading={<Icon name="plus" color={color.accent} />}
          onPress={() =>
            onChange((prev) => ({
              ...prev,
              links: [...prev.links, emptyProjectLink()],
            }))
          }
        />
      </Section>
    </DetailsSheet>
  );
};

const styles = StyleSheet.create({
  link: { gap: tokens.space[2], paddingBottom: tokens.space[2] },
});
