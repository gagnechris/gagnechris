import type { VersionedEntityActionBarProps } from '@gagnechris/app-core';
import { saveLabel } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { publishStatusLabel } from './labels';

type HeaderProps = {
  actionBar: VersionedEntityActionBarProps;
  offline: boolean;
  ready: boolean;
  preview?: boolean;
  onTogglePreview?: () => void;
  onDetails?: () => void;
  onMenu?: () => void;
  menuLabel: string;
};

/** Save state, then Preview, Details and ⋯ when given, for a publishable editor's header. */
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
      {saveLabel(actionBar.saveState, actionBar.dirty, { offline })}
    </Text>
    {onTogglePreview ? (
      <IconButton
        size="lg"
        label="Preview"
        pressed={preview}
        disabled={!ready}
        onPress={onTogglePreview}
      >
        <Icon
          name={preview ? 'eye.fill' : 'eye'}
          color={preview ? color.accent : color.ink}
        />
      </IconButton>
    ) : null}
    {onDetails ? (
      <IconButton
        size="lg"
        label="Details"
        disabled={!ready}
        onPress={onDetails}
      >
        <Icon name="slider.horizontal.3" color={color.ink} />
      </IconButton>
    ) : null}
    {onMenu ? (
      <IconButton
        size="lg"
        label={menuLabel}
        disabled={!ready}
        onPress={onMenu}
      >
        <Icon name="ellipsis.circle" color={color.ink} />
      </IconButton>
    ) : null}
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
          variant="primary"
          disabled={actionBar.busy || offline}
          onPress={actionBar.onPublish}
        >
          {published ? 'Publish changes' : 'Publish'}
        </Button>
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
