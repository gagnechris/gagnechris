import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text, type TextStyle } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

export type TextButtonSize = 'xs' | 'base' | 'body';

type Props = {
  children: string;
  onPress: () => void;
  /** Semibold, for the confirming action of a bar (Done, Add). */
  strong?: boolean;
  size?: TextButtonSize;
  /** Where the text sits when it is narrower than the 44 pt target. */
  align?: 'start' | 'center' | 'end';
  /** Adds side padding, for a button at the end of a field. */
  padded?: boolean;
  disabled?: boolean;
  /** Defaults to the text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

/** Accent text with no box: a sheet's Cancel and Done, a field's Add. */
export const TextButton = ({
  children,
  onPress,
  strong,
  size = 'body',
  align = 'center',
  padded,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: Props) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? children}
    accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    testID={testID}
    style={({ pressed }) => [
      styles.base,
      { alignItems: ALIGN[align] },
      padded && styles.padded,
      pressed && styles.pressed,
    ]}
  >
    <Text
      style={[
        strong ? styles.strong : styles.regular,
        textSize[size],
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Text>
  </Pressable>
);

const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
} as const;

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    justifyContent: 'center',
  },
  padded: { paddingHorizontal: tokens.space[3] },
  pressed: { opacity: 0.6 },
  regular: { ...font.regular, color: color.accent },
  strong: { ...font.semibold, color: color.accent },
  disabled: { color: color.muted },
});

const textSize = StyleSheet.create<Record<TextButtonSize, TextStyle>>({
  xs: { fontSize: tokens.text.xs },
  base: { fontSize: tokens.text.base },
  body: { fontSize: tokens.text.body },
});
