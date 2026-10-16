import type { SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';
import { color, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

export type CheckboxShape = 'square' | 'round';

type Props = {
  /** VoiceOver's name; the row beside it shows the visible text. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** `square` for settings and fields, `round` for tasks. */
  shape?: CheckboxShape;
  /** Square only: some but not all. */
  indeterminate?: boolean;
  /** Round only: a dropped task. */
  dropped?: boolean;
  disabled?: boolean;
  size?: number;
};

const symbol = (
  shape: CheckboxShape,
  checked: boolean,
  indeterminate: boolean,
  dropped: boolean,
): SFSymbol => {
  if (shape === 'round') {
    if (dropped) return 'minus.circle';
    return checked ? 'checkmark.circle.fill' : 'circle';
  }
  if (indeterminate) return 'minus.square.fill';
  return checked ? 'checkmark.square.fill' : 'square';
};

export const Checkbox = ({
  label,
  checked,
  onChange,
  shape = 'square',
  indeterminate = false,
  dropped = false,
  disabled,
  size = 22,
}: Props) => {
  const mixed = shape === 'square' && indeterminate;
  const isDropped = shape === 'round' && dropped;
  const tint =
    checked || mixed ? color.accent : isDropped ? color.muted : color.inkSoft;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{
        checked: mixed ? 'mixed' : checked || isDropped,
        disabled,
      }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={8}
      style={[styles.box, disabled && styles.disabled]}
    >
      <Icon
        name={symbol(shape, checked, mixed, isDropped)}
        size={size}
        color={tint}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  box: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
});
