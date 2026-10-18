import { tokens } from '@gagnechris/tokens';
import type { SFSymbol } from 'expo-symbols';
import {
  ActionSheetIOS,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

/** `add` is the dashed chip that adds an item to a set of chips. */
export type ChipTone = 'neutral' | 'selected' | 'warning' | 'danger' | 'add';

type ChipProps = {
  children: string;
  tone?: ChipTone;
  dot?: boolean;
  icon?: SFSymbol;
  onPress?: () => void;
  /** Makes it a toggle that reads as selected when on. */
  pressed?: boolean;
  onRemove?: () => void;
  /** Defaults to "Remove {children}". */
  removeLabel?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const CHIP_HEIGHT = 28;
const CHIP_SLOP = (MIN_TARGET - CHIP_HEIGHT) / 2;

export const Chip = ({
  children,
  tone = 'neutral',
  dot,
  icon,
  onPress,
  pressed,
  onRemove,
  removeLabel,
  disabled,
  accessibilityLabel,
  accessibilityHint,
}: ChipProps) => {
  const ink = chipText[tone].color;
  const content = (
    <>
      {dot ? <View style={[styles.dot, { backgroundColor: ink }]} /> : null}
      {icon ? <Icon name={icon} size={12} color={ink} /> : null}
      <Text style={[styles.text, chipText[tone]]}>{children}</Text>
    </>
  );
  const remove = onRemove ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={removeLabel ?? `Remove ${children}`}
      onPress={onRemove}
      disabled={disabled}
      hitSlop={CHIP_SLOP}
      style={styles.remove}
    >
      <Icon name="xmark" size={10} color={ink} />
    </Pressable>
  ) : null;
  const box = [styles.chip, chipBox[tone], disabled && styles.disabled];
  if (!onPress) {
    return (
      <View style={box}>
        <View
          style={styles.content}
          accessible
          accessibilityLabel={accessibilityLabel ?? children}
        >
          {content}
        </View>
        {remove}
      </View>
    );
  }
  const press = {
    accessibilityRole: 'button',
    accessibilityLabel: accessibilityLabel ?? children,
    accessibilityHint,
    accessibilityState: { disabled, selected: pressed },
    onPress,
    disabled,
    hitSlop: CHIP_SLOP,
  } as const;
  // Side by side, not nested: VoiceOver can't reach a button inside another.
  if (remove) {
    return (
      <View style={box}>
        <Pressable
          {...press}
          style={({ pressed: touched }) => [
            styles.content,
            touched && styles.touched,
          ]}
        >
          {content}
        </Pressable>
        {remove}
      </View>
    );
  }
  return (
    <Pressable
      {...press}
      style={({ pressed: touched }) => [...box, touched && styles.touched]}
    >
      <View style={styles.content}>{content}</View>
    </Pressable>
  );
};

type Option<T extends string> = { value: T; label: string };

/** An action sheet of choices with the current one disabled. */
export function pickFromSheet<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title?: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const labels = options.map((o) => o.label);
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...labels, 'Cancel'],
      cancelButtonIndex: labels.length,
      disabledButtonIndices: [options.findIndex((o) => o.value === value)],
    },
    (index) => {
      const picked = options[index];
      if (picked) onChange(picked.value);
    },
  );
}

type ChipSelectProps<T extends string> = {
  /** What is being chosen; VoiceOver reads it before the current choice. */
  label: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Shown while nothing is chosen. */
  placeholder?: string;
  /** The action sheet's title. */
  title?: string;
  disabled?: boolean;
};

/** An outline chip with a chevron that opens an action sheet of choices. */
export const ChipSelect = <T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = `Add ${label.toLowerCase()}`,
  title,
  disabled,
}: ChipSelectProps<T>) => {
  const current = options.find((o) => o.value === value)?.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={current ? `${label}: ${current}` : placeholder}
      accessibilityHint={`Chooses ${options.map((o) => o.label).join(', ')}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => pickFromSheet({ title, options, value, onChange })}
      style={({ pressed }) => [
        styles.select,
        pressed && styles.selectPressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={current ? styles.selectLabel : styles.selectPlaceholder}>
        {current ?? placeholder}
      </Text>
      <Icon name="chevron.down" size={12} color={color.inkSoft} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CHIP_HEIGHT,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: tokens.space[3],
  },
  touched: { opacity: 0.6 },
  disabled: { opacity: 0.55 },
  text: { ...font.medium, fontSize: tokens.text.caption },
  dot: { width: 6, height: 6, borderRadius: 3 },
  // With the chip's slop on every side, a 44 pt square.
  remove: {
    minWidth: CHIP_HEIGHT,
    minHeight: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    minHeight: MIN_TARGET,
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.md + 4,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  selectPressed: { backgroundColor: color.fill },
  selectLabel: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.ink,
  },
  selectPlaceholder: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.muted,
  },
});

const chipBox = StyleSheet.create<Record<ChipTone, ViewStyle>>({
  neutral: { backgroundColor: color.fill },
  selected: {
    backgroundColor: tokens.primary[50],
    borderWidth: 1,
    borderColor: tokens.primary[300],
  },
  warning: { backgroundColor: tokens.color.warningBg },
  danger: {
    backgroundColor: tokens.color.dangerBg,
    borderWidth: 1,
    borderColor: tokens.color.dangerBorder,
  },
  add: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderStyle: 'dashed',
  },
});

const chipText = StyleSheet.create<Record<ChipTone, TextStyle>>({
  neutral: { color: color.inkSoft },
  selected: { color: tokens.primary[800] },
  warning: { color: tokens.color.warning },
  danger: { color: tokens.color.danger },
  add: { color: color.accent },
});
