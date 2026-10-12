import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../../theme';

type Props = {
  done: boolean;
  onToggleDone: () => void;
  onSnooze: () => void;
};

/** Complete / Reopen and Snooze, pinned above the tab bar. */
export const TaskActionBar = ({ done, onToggleDone, onSnooze }: Props) => (
  <View style={styles.bottomBar}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={done ? 'Reopen task' : 'Complete task'}
      onPress={onToggleDone}
      style={[styles.barButton, styles.primary]}
    >
      <Text style={styles.primaryText}>{done ? 'Reopen' : 'Complete'}</Text>
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Snooze"
      onPress={onSnooze}
      style={[styles.barButton, styles.secondary]}
    >
      <Text style={styles.secondaryText}>Snooze</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: 'row',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[2],
    paddingBottom: tokens.space[2],
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  barButton: {
    flex: 1,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
  },
  primary: { backgroundColor: color.accent },
  primaryText: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.surface,
  },
  secondary: { backgroundColor: color.fill },
  secondaryText: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.ink,
  },
});
