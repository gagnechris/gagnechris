import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

type Props<T extends string> = {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
};

export const SegmentedControl = <T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: Props<T>) => (
  <View
    style={styles.track}
    accessibilityRole="tablist"
    accessibilityLabel={label}
  >
    {options.map((option, index) => {
      const selected = option === value;
      return (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityLabel={labels[option]}
          accessibilityHint={`${index + 1} of ${options.length}`}
          accessibilityState={{ selected }}
          onPress={() => onChange(option)}
          style={[styles.segment, selected && styles.selected]}
        >
          <Text style={[styles.text, selected && styles.selectedText]}>
            {labels[option]}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: color.fill,
    borderRadius: tokens.radius.md + 2,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space[1],
  },
  selected: {
    backgroundColor: color.surface,
    shadowColor: '#101828',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  text: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    textAlign: 'center',
  },
  selectedText: { ...font.semibold, color: color.ink },
});
