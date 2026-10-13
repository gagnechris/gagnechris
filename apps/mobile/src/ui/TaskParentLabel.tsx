import { tokens } from '@gagnechris/tokens';
import { StyleSheet, Text } from 'react-native';
import { font } from '../theme';

/** The parent's title above a subtask's, muted once the parent is finished. */
export const TaskParentLabel = ({
  title,
  finished,
}: {
  title: string;
  finished: boolean;
}) => (
  <Text
    style={[styles.label, finished && styles.finished]}
    numberOfLines={1}
    accessibilityLabel={`Subtask of ${title}${finished ? ', finished' : ''}`}
  >
    {title}
  </Text>
);

const styles = StyleSheet.create({
  label: {
    ...font.regular,
    fontSize: tokens.text.xs,
    color: tokens.neutral[500],
  },
  finished: { color: tokens.neutral[400], textDecorationLine: 'line-through' },
});
