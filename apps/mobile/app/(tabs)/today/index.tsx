import {
  formatCalendarDay,
  localDateString,
  weekdayName,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font } from '../../../src/theme';
import { AreaChip } from '../../../src/ui/AreaChip';
import { EmptyState } from '../../../src/ui/EmptyState';

const TodayScreen = () => {
  const insets = useSafeAreaInsets();
  const [day] = useState(() => localDateString());
  const weekday = weekdayName(day, 'long');
  const date = formatCalendarDay(day, { month: 'long' });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + tokens.space[2] },
      ]}
    >
      <View style={styles.header}>
        <View
          style={styles.heading}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`Today, ${weekday}, ${date}`}
        >
          <Text style={styles.kicker}>{weekday}</Text>
          <Text style={styles.title}>{date}</Text>
        </View>
        <AreaChip />
      </View>
      <EmptyState
        icon="sun.max"
        title="Nothing written today"
        body="Today’s note, open tasks and what’s coming up show here."
      />
    </ScrollView>
  );
};

export default TodayScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.surface },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[8],
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[3],
    paddingBottom: tokens.space[4],
  },
  heading: { flexShrink: 1 },
  kicker: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  title: {
    ...font.bold,
    fontSize: tokens.text['2xl'],
    letterSpacing: -0.5,
    color: color.ink,
  },
});
