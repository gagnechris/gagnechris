import { tokens } from '@gagnechris/tokens';
import { StyleSheet, View } from 'react-native';
import { color } from '../../theme';
import { Button } from '../../ui/Button';

type Props = {
  done: boolean;
  onToggleDone: () => void;
  onSnooze: () => void;
};

/** Complete / Reopen and Snooze, pinned above the tab bar. */
export const TaskActionBar = ({ done, onToggleDone, onSnooze }: Props) => (
  <View style={styles.bottomBar}>
    <Button
      variant="primary"
      accessibilityLabel={done ? 'Reopen task' : 'Complete task'}
      onPress={onToggleDone}
    >
      {done ? 'Reopen' : 'Complete'}
    </Button>
    <Button onPress={onSnooze}>Snooze</Button>
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
});
