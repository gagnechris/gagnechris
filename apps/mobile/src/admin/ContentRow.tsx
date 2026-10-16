import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

type Props = {
  title: string;
  meta: string;
  /** Tags or stack, on their own line. */
  tags: readonly string[];
  divider?: boolean;
  /** Without it the row is plain text. */
  onPress?: () => void;
};

export const ContentRow = ({ title, meta, tags, divider, onPress }: Props) => {
  const tagLine = tags.join(', ');
  const label = [title, meta, tagLine].filter(Boolean).join(', ');
  const body = (
    <>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>{meta}</Text>
      {tagLine ? <Text style={styles.tags}>{tagLine}</Text> : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={[styles.row, divider && styles.divider]}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      {body}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TARGET + 8,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  pressed: { backgroundColor: color.fill },
  title: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
  meta: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  tags: { ...font.regular, fontSize: tokens.text.caption, color: color.muted },
});
