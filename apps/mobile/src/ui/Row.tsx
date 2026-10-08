import { tokens } from '@gagnechris/tokens';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

type Props = {
  title: string;
  detail?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  destructive?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress?: () => void;
};

export const Row = ({
  title,
  detail,
  leading,
  trailing,
  destructive,
  divider,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: Props) => {
  const body = (
    <>
      {leading}
      <Text style={[styles.title, destructive && styles.destructive]}>
        {title}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {trailing}
    </>
  );
  const style = [styles.row, divider && styles.divider];
  const label = accessibilityLabel ?? (detail ? `${title}, ${detail}` : title);
  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.space[3],
    minHeight: MIN_TARGET + 8,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[2],
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  pressed: { backgroundColor: color.fill },
  title: {
    flexGrow: 1,
    flexShrink: 1,
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
  },
  destructive: { color: color.alert },
  detail: {
    ...font.medium,
    fontSize: tokens.text.body,
    color: color.inkSoft,
  },
});
