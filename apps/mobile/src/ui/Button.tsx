import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  accessibilityHint?: string;
};

export const Button = ({
  title,
  onPress,
  variant = 'primary',
  disabled,
  accessibilityHint,
}: Props) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.base,
      variant === 'primary' ? styles.primary : styles.secondary,
      (pressed || disabled) && styles.dim,
    ]}
  >
    <Text
      style={variant === 'primary' ? styles.primaryText : styles.secondaryText}
    >
      {title}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  base: {
    flexGrow: 1,
    minHeight: MIN_TARGET + 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[2],
    borderRadius: tokens.radius.lg - 4,
  },
  primary: { backgroundColor: color.accent },
  secondary: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tokens.neutral[300],
  },
  dim: { opacity: 0.7 },
  primaryText: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.surface,
    textAlign: 'center',
  },
  secondaryText: {
    ...font.medium,
    fontSize: tokens.text.body,
    color: color.ink,
    textAlign: 'center',
  },
});
