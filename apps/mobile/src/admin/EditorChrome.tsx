import type { VersionedEntityActionBarProps } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { saveLabel } from '../notebook/saveLabel';
import { color, font, MIN_TARGET } from '../theme';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { publishStatusLabel } from './labels';

type HeaderProps = {
  actionBar: VersionedEntityActionBarProps;
  offline: boolean;
  ready: boolean;
  preview: boolean;
  onTogglePreview: () => void;
  onDetails: () => void;
  onMenu: () => void;
  menuLabel: string;
};

/** Save state, Preview, Details and ⋯ for a post or project editor's header. */
export const EditorHeaderButtons = ({
  actionBar,
  offline,
  ready,
  preview,
  onTogglePreview,
  onDetails,
  onMenu,
  menuLabel,
}: HeaderProps) => (
  <View style={styles.headerRight}>
    <Text style={styles.saveState} accessibilityLiveRegion="polite">
      {saveLabel(actionBar.saveState, actionBar.dirty, offline)}
    </Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Preview"
      accessibilityState={{ selected: preview }}
      onPress={onTogglePreview}
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
      onPress={onDetails}
      style={styles.headerButton}
      disabled={!ready}
    >
      <Icon name="slider.horizontal.3" color={color.ink} />
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={menuLabel}
      onPress={onMenu}
      style={styles.headerButton}
      disabled={!ready}
    >
      <Icon name="ellipsis.circle" color={color.ink} />
    </Pressable>
  </View>
);

/** The status line, with Publish while there is something to publish. */
export const PublishBar = ({
  actionBar,
  offline,
}: {
  actionBar: VersionedEntityActionBarProps;
  offline: boolean;
}) => {
  const published = actionBar.status === 'published';
  const canPublish =
    !published || actionBar.hasUnpublishedChanges || actionBar.dirty;
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{publishStatusLabel(actionBar)}</Text>
      {canPublish ? (
        <Button
          title={published ? 'Publish changes' : 'Publish'}
          disabled={actionBar.busy || offline}
          onPress={actionBar.onPublish}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
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
});
