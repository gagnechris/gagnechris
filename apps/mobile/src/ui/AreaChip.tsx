import { tokens } from '@gagnechris/tokens';
import { useCallback } from 'react';
import { ActionSheetIOS, Pressable, StyleSheet, Text } from 'react-native';
import { useArea } from '../area';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

export function useAreaPicker(): () => void {
  const { area, areas, setArea } = useArea();
  return useCallback(() => {
    const labels = areas.map((a) => a.name);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Show notes and tasks from',
        options: [...labels, 'Cancel'],
        cancelButtonIndex: labels.length,
        disabledButtonIndices: [areas.findIndex((a) => a.id === area)],
      },
      (index) => {
        const picked = areas[index];
        if (picked) setArea(picked.id);
      },
    );
  }, [area, areas, setArea]);
}

export const AreaChip = () => {
  const { areaName, areas } = useArea();
  const pick = useAreaPicker();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Area: ${areaName}`}
      accessibilityHint={`Chooses ${areas.map((a) => a.name).join(', ')}`}
      onPress={pick}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{areaName}</Text>
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
