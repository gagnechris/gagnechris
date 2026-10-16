import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

type Segment = { key: string; label: string; count?: number };

const segmentText = ({ label, count }: Segment) =>
  count === undefined ? label : `${label} · ${count}`;

/** The track SegmentedRadio and Tabs share: one row of equal segments. */
export const SegmentTrack = ({
  label,
  segments,
  selected,
  onSelect,
}: {
  label: string;
  segments: readonly Segment[];
  selected: string;
  onSelect: (key: string) => void;
}) => (
  <View
    style={styles.track}
    accessibilityRole="tablist"
    accessibilityLabel={label}
  >
    {segments.map((segment, index) => {
      const on = segment.key === selected;
      const text = segmentText(segment);
      return (
        <Pressable
          key={segment.key}
          accessibilityRole="tab"
          accessibilityLabel={text}
          accessibilityHint={`${index + 1} of ${segments.length}`}
          accessibilityState={{ selected: on }}
          onPress={() => onSelect(segment.key)}
          style={[styles.segment, on && styles.selected]}
        >
          <Text style={[styles.text, on && styles.selectedText]}>{text}</Text>
        </Pressable>
      );
    })}
  </View>
);

type Option<T extends string> = { value: T; label: string; count?: number };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export const SegmentedRadio = <T extends string>({
  label,
  options,
  value,
  onChange,
}: Props<T>) => (
  <SegmentTrack
    label={label}
    segments={options.map(({ value: key, label: text, count }) => ({
      key,
      label: text,
      count,
    }))}
    selected={value}
    onSelect={(key) => onChange(key as T)}
  />
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

export const segmentOptions = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): Option<T>[] => values.map((value) => ({ value, label: labels[value] }));
