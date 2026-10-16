import { tokens } from '@gagnechris/tokens';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

type Props = {
  title: string;
  meta?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  current?: boolean;
  destructive?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress?: () => void;
};

export const ListRow = ({
  title,
  meta,
  leading,
  trailing,
  current,
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
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {trailing}
    </>
  );
  const style = [
    styles.row,
    divider && styles.divider,
    current && styles.current,
  ];
  const label = accessibilityLabel ?? (meta ? `${title}, ${meta}` : title);
  const state = current ? { selected: true } : undefined;
  if (!onPress) {
    return (
      <View
        style={style}
        accessible
        accessibilityLabel={label}
        accessibilityState={state}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={state}
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
    alignContent: 'center',
    gap: tokens.space[3],
    minHeight: MIN_TARGET + 8,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[2],
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  current: { backgroundColor: color.accentSoft },
  pressed: { backgroundColor: color.fill },
  title: {
    flexGrow: 1,
    flexShrink: 1,
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
  },
  destructive: { color: color.alert },
  meta: {
    ...font.medium,
    fontSize: tokens.text.body,
    color: color.inkSoft,
  },
});
