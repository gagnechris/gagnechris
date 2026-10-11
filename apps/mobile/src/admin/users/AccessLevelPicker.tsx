import { LEVEL_DESCRIPTIONS, LEVEL_ORDER } from '@gagnechris/app-core';
import { ACCESS_LEVEL_LABELS, type AccessLevel } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Section } from '../../ui/Section';

type Props = {
  value: AccessLevel | null;
  onChange: (level: AccessLevel) => void;
  isDisabled?: (level: AccessLevel) => boolean;
};

export const AccessLevelPicker = ({
  value,
  onChange,
  isDisabled = () => false,
}: Props) => (
  <Section title="Access">
    {LEVEL_ORDER.map((level, index) => {
      const off = isDisabled(level);
      const on = value === level;
      return (
        <Pressable
          key={level}
          accessibilityRole="radio"
          accessibilityLabel={ACCESS_LEVEL_LABELS[level]}
          accessibilityHint={LEVEL_DESCRIPTIONS[level]}
          accessibilityState={{ checked: on, disabled: off }}
          disabled={off}
          onPress={() => onChange(level)}
          style={[styles.row, index > 0 && styles.divider, off && styles.off]}
        >
          <View style={styles.text}>
            <Text style={styles.name}>{ACCESS_LEVEL_LABELS[level]}</Text>
            <Text style={styles.desc}>{LEVEL_DESCRIPTIONS[level]}</Text>
          </View>
          {on ? <Icon name="checkmark" size={18} color={color.accent} /> : null}
        </Pressable>
      );
    })}
  </Section>
);

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  off: { opacity: 0.4 },
  text: { flex: 1, gap: 2 },
  name: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
  desc: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
});
