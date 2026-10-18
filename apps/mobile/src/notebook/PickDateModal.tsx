import { calendarDay } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { TextButton } from '../ui/TextButton';

const dateOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

type Props = {
  title: string | null;
  today: string;
  onDone: (day: string) => void;
  onCancel: () => void;
};

/** "Pick a date…": a calendar sheet; the day comes back as `yyyy-mm-dd`. */
export const PickDateModal = ({ title, today, onDone, onCancel }: Props) => {
  const [picked, setPicked] = useState(() => dateOf(today));
  return (
    <Modal
      visible={title !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <TextButton align="start" onPress={onCancel}>
            Cancel
          </TextButton>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <TextButton
            strong
            align="end"
            onPress={() =>
              onDone(
                calendarDay(
                  picked.getFullYear(),
                  picked.getMonth() + 1,
                  picked.getDate(),
                ),
              )
            }
          >
            Done
          </TextButton>
        </View>
        <DateTimePicker
          value={picked}
          mode="date"
          display="inline"
          minimumDate={dateOf(today)}
          onChange={(_event, date) => {
            if (date) setPicked(date);
          }}
          accentColor={color.accent}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: color.surface,
    padding: tokens.space[4],
    gap: tokens.space[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
});
