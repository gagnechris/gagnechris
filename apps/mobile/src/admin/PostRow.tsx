import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

type Props = {
  title: string;
  meta: string;
  tags: readonly string[];
  divider?: boolean;
  onPress: () => void;
};

export const PostRow = ({ title, meta, tags, divider, onPress }: Props) => {
  const tagLine = tags.join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, meta, tagLine].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>{meta}</Text>
      {tagLine ? <Text style={styles.tags}>{tagLine}</Text> : null}
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
