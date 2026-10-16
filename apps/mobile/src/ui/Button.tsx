import { tokens } from '@gagnechris/tokens';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  children: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Shows a spinner and ignores presses; the label stays. */
  loading?: boolean;
  accessibilityHint?: string;
};

export const Button = ({
  children,
  onPress,
  variant = 'default',
  size = 'md',
  disabled,
  loading,
  accessibilityHint,
}: Props) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={children}
    accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: !!disabled, busy: !!loading }}
    disabled={disabled}
    onPress={loading ? undefined : onPress}
    style={({ pressed }) => [
      styles.base,
      boxSize[size],
      box[variant],
      pressed && styles.pressed,
      disabled && styles.disabled,
    ]}
  >
    {loading ? (
      <ActivityIndicator size="small" color={label[variant].color} />
    ) : null}
    <Text style={[styles.text, textSize[size], label[variant]]}>
      {children}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  base: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: tokens.space[2],
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space[2],
    borderRadius: tokens.radius.lg - 4,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
  text: { textAlign: 'center' },
});

// Every size clears the 44 pt touch target; `md` is the app's standard button.
const boxSize = StyleSheet.create<Record<ButtonSize, ViewStyle>>({
  sm: { minHeight: MIN_TARGET, paddingHorizontal: tokens.space[3] },
  md: { minHeight: MIN_TARGET + 6, paddingHorizontal: tokens.space[4] },
  lg: { minHeight: MIN_TARGET + 12, paddingHorizontal: 20 },
});

const textSize = StyleSheet.create<Record<ButtonSize, TextStyle>>({
  sm: { fontSize: tokens.text.sm },
  md: { fontSize: tokens.text.body },
  lg: { fontSize: tokens.text.lg },
});

const box = StyleSheet.create<Record<ButtonVariant, ViewStyle>>({
  default: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tokens.neutral[300],
  },
  primary: { backgroundColor: color.accent },
  danger: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tokens.color.dangerBorder,
  },
  ghost: {},
  link: { flexGrow: 0, alignSelf: 'flex-start', paddingHorizontal: 0 },
});

const label = StyleSheet.create<Record<ButtonVariant, TextStyle>>({
  default: { ...font.medium, color: color.ink },
  primary: { ...font.semibold, color: color.surface },
  danger: { ...font.semibold, color: tokens.color.danger },
  ghost: { ...font.semibold, color: tokens.neutral[700] },
  link: {
    ...font.medium,
    color: tokens.color.link,
    textDecorationLine: 'underline',
  },
});
