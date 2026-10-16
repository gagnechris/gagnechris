import { tokens } from '@gagnechris/tokens';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

export type IconButtonVariant = 'ghost' | 'outline' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  /** VoiceOver's name for the button. */
  label: string;
  /** An `Icon`, sized and tinted by the caller. */
  children: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Makes it a toggle that reads as selected when on. */
  pressed?: boolean;
  /** A badge at the top right, read after the label. */
  count?: number;
  disabled?: boolean;
  accessibilityHint?: string;
};

const SIDE: Record<IconButtonSize, number> = { sm: 28, md: 36, lg: MIN_TARGET };

export const IconButton = ({
  label,
  children,
  onPress,
  onLongPress,
  variant = 'ghost',
  size = 'md',
  pressed,
  count,
  disabled,
  accessibilityHint,
}: Props) => {
  const showCount = count !== undefined && count > 0;
  // Smaller sizes reach the 44 pt target through their slop.
  const slop = (MIN_TARGET - SIDE[size]) / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={showCount ? `${label}, ${count}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected: pressed }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={slop > 0 ? slop : undefined}
      style={({ pressed: touched }) => [
        styles.base,
        { minWidth: SIDE[size], minHeight: SIDE[size] },
        box[variant],
        pressed && styles.on,
        touched && touchedBox[variant],
        disabled && styles.disabled,
      ]}
    >
      {children}
      {showCount ? (
        <View style={styles.count} importantForAccessibility="no">
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
  },
  on: { backgroundColor: color.accentSoft },
  disabled: { opacity: 0.55 },
  count: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    paddingHorizontal: 4,
    borderRadius: tokens.radius.full,
    backgroundColor: color.accent,
    alignItems: 'center',
  },
  countText: {
    ...font.semibold,
    fontSize: tokens.text.xs - 1,
    color: color.surface,
  },
});

const box = StyleSheet.create<Record<IconButtonVariant, ViewStyle>>({
  ghost: {},
  outline: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tokens.neutral[300],
  },
  danger: {},
});

const touchedBox = StyleSheet.create<Record<IconButtonVariant, ViewStyle>>({
  ghost: { backgroundColor: color.fill },
  outline: { backgroundColor: color.fill },
  danger: { backgroundColor: tokens.color.dangerBg },
});
