import { tokens } from '@gagnechris/tokens';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutboxFailedCount } from '../outbox/useOutbox';
import { useUpgradeRequired } from '../sync/upgradeRequired';
import { useIsOnline } from './connectivity';
import { useUnsavedEditCount } from './useUnsavedEditCount';

export const OFFLINE_MESSAGE = 'Offline — showing saved copy';
export const EDITOR_OFFLINE_MESSAGE = 'Offline — will save when connected';

export const upgradeMessage = (minimum: string) =>
  `Update the app from TestFlight to keep syncing${minimum ? ` (${minimum} or later)` : ''}.`;

export const unsavedEditsLabel = (count: number) =>
  count === 1 ? '1 unsaved edit' : `${count} unsaved edits`;

export const failedEditsLabel = (count: number) =>
  count === 1 ? "1 edit couldn't sync" : `${count} edits couldn't sync`;

/**
 * The offline banner, the count of edits still waiting to save, and the
 * update prompt after the API refuses this app version. Sits above
 * the navigator and takes the top inset only while it shows.
 */
export const NetworkStatus = () => {
  const online = useIsOnline();
  const unsaved = useUnsavedEditCount();
  const failed = useOutboxFailedCount();
  const upgrade = useUpgradeRequired();
  const insets = useSafeAreaInsets();
  if (online && unsaved === 0 && failed === 0 && upgrade === null) return null;
  return (
    <View
      style={[styles.bar, { paddingTop: insets.top + tokens.space[1] }]}
      accessibilityRole="summary"
    >
      {upgrade === null ? null : (
        <Text style={styles.text} testID="upgrade-required">
          {upgradeMessage(upgrade)}
        </Text>
      )}
      {online ? null : <Text style={styles.text}>{OFFLINE_MESSAGE}</Text>}
      {unsaved > 0 ? (
        <Text style={styles.text} testID="unsaved-edits">
          {unsavedEditsLabel(unsaved)}
        </Text>
      ) : null}
      {failed > 0 ? (
        <Text style={styles.text} testID="failed-edits">
          {failedEditsLabel(failed)}
        </Text>
      ) : null}
    </View>
  );
};

/** For an editor whose own draft is not saved yet. */
export const EditorOfflineNotice = ({ dirty }: { dirty: boolean }) => {
  const online = useIsOnline();
  if (online || !dirty) return null;
  return <Text style={styles.notice}>{EDITOR_OFFLINE_MESSAGE}</Text>;
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: tokens.neutral[100],
    borderBottomColor: tokens.neutral[200],
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: tokens.space[1],
    paddingHorizontal: tokens.space[4],
    alignItems: 'center',
    gap: tokens.space[1],
  },
  text: {
    fontSize: tokens.text.xs,
    color: tokens.neutral[600],
  },
  notice: {
    fontSize: tokens.text.xs,
    color: tokens.neutral[500],
  },
});
