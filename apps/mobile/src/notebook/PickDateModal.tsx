import { calendarDay } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

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
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.action}
          >
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onDone(
                calendarDay(
                  picked.getFullYear(),
                  picked.getMonth() + 1,
                  picked.getDate(),
                ),
              )
            }
            style={styles.action}
          >
            <Text style={styles.done}>Done</Text>
          </Pressable>
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
  action: { minHeight: MIN_TARGET, justifyContent: 'center' },
  title: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
  cancel: { ...font.regular, fontSize: tokens.text.body, color: color.accent },
  done: { ...font.semibold, fontSize: tokens.text.body, color: color.accent },
});
