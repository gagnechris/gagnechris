import {
  NOTEBOOK_AREA_FILTERS,
  NOTEBOOK_AREA_LABELS,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useCallback } from 'react';
import { ActionSheetIOS, Pressable, StyleSheet, Text } from 'react-native';
import { useArea } from '../area';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

export function useAreaPicker(): () => void {
  const { area, setArea } = useArea();
  return useCallback(() => {
    const labels = NOTEBOOK_AREA_FILTERS.map((f) => NOTEBOOK_AREA_LABELS[f]);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Show notes and tasks from',
        options: [...labels, 'Cancel'],
        cancelButtonIndex: labels.length,
        disabledButtonIndices: [NOTEBOOK_AREA_FILTERS.indexOf(area)],
      },
      (index) => {
        const picked = NOTEBOOK_AREA_FILTERS[index];
        if (picked) setArea(picked);
      },
    );
  }, [area, setArea]);
}

export const AreaChip = () => {
  const { area } = useArea();
  const pick = useAreaPicker();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Area: ${NOTEBOOK_AREA_LABELS[area]}`}
      accessibilityHint="Chooses Work, Personal or All"
      onPress={pick}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{NOTEBOOK_AREA_LABELS[area]}</Text>
      <Icon name="chevron.down" size={12} color={color.inkSoft} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
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
  pressed: { backgroundColor: color.fill },
  label: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.ink,
  },
});
