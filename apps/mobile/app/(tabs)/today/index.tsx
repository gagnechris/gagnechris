import {
  useTaskPatch,
  useTaskToggle,
  useTodayTasks,
  type NotebookArea,
  type Task,
} from '@gagnechris/app-core';
import {
  addDays,
  formatCalendarDay,
  snoozeBaseDay,
  weekdayName,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArea } from '../../../src/area';
import { PickDateModal } from '../../../src/notebook/PickDateModal';
import { showSnoozeOrDrop } from '../../../src/notebook/taskActionSheets';
import { TodayNote } from '../../../src/notebook/TodayNote';
import { TodaySheet } from '../../../src/notebook/TodaySheet';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { AreaChip } from '../../../src/ui/AreaChip';
import { Icon } from '../../../src/ui/Icon';

const NO_IDS: ReadonlySet<string> = new Set();

const TodayScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const today = useLocalToday();
  const { area } = useArea();
  // Null follows the device's day, so midnight moves it on.
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const writingArea: NotebookArea | null = area === 'all' ? null : area;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [snoozing, setSnoozing] = useState<Task | null>(null);
  const appendEmbedRef = useRef<((taskId: string) => void) | null>(null);

  const noteKey = writingArea ? `${writingArea}:${date}` : null;
  const [embedded, setEmbedded] = useState<{
    key: string;
    ids: ReadonlySet<string> | null;
  } | null>(null);
  const onEmbeddedIds = useCallback(
    (ids: ReadonlySet<string> | null) => {
      if (noteKey) setEmbedded({ key: noteKey, ids });
    },
    [noteKey],
  );
  // With no note on the page (All), nothing is embedded.
  const embeddedIds = noteKey
    ? embedded?.key === noteKey
      ? embedded.ids
      : null
    : NO_IDS;

  const { buckets, stillOpenRows, loading, loadError } = useTodayTasks({
    area: writingArea ?? undefined,
    day: date,
    embeddedIds,
  });
  const { toggle, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const readOnly = writingArea === null;
  const comingUpCount = buckets.comingUp.reduce(
    (n, d) => n + d.tasks.length,
    0,
  );
  const tasksLoading = loading.stillOpen || loading.comingUp;
  const tasksError = loadError
    ? 'Could not load tasks.'
    : (patchError ?? toggleError ?? null);
  const snoozeFrom = snoozeBaseDay(date, today);
  const canAddToNote = writingArea !== null && date === today;

  const openTask = (id: string) => router.push(`/tasks/${id}`);
  const addToNote = (task: Task) => {
    appendEmbedRef.current?.(task.id);
    setSheetOpen(false);
  };
  const showMore = (task: Task) =>
    showSnoozeOrDrop({
      title: task.title,
      snoozeFrom,
      onSnooze: (schedule) => void patch(task, schedule),
      onPickDate: () => setSnoozing(task),
      onDrop: () => void patch(task, { status: 'dropped' }),
    });
  const goTo = (day: string) => setPicked(day === today ? null : day);

  const weekday = weekdayName(date, 'long');
  const heading = formatCalendarDay(date, {
    month: 'long',
    year: date.slice(0, 4) !== today.slice(0, 4),
  });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + tokens.space[2] },
      ]}
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View
          style={styles.heading}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${date === today ? 'Today, ' : ''}${weekday}, ${heading}`}
        >
          <Text style={styles.kicker}>
            {weekday}
            {date === today ? ' · Today' : ''}
          </Text>
          <Text style={styles.title}>{heading}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={() => router.push('/search')}
            style={styles.navButton}
          >
            <Icon name="magnifyingglass" size={20} color={color.ink} />
          </Pressable>
          <AreaChip />
        </View>
      </View>
      <View style={styles.dayNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => goTo(addDays(date, -1))}
          style={styles.navButton}
        >
          <Icon name="chevron.left" size={18} color={color.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to today"
          accessibilityState={{ disabled: date === today }}
          disabled={date === today}
          onPress={() => goTo(today)}
          style={styles.navButton}
        >
          <Text
            style={[styles.navText, date === today && styles.navTextDisabled]}
          >
            Today
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => goTo(addDays(date, 1))}
          style={styles.navButton}
        >
          <Icon name="chevron.right" size={18} color={color.ink} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          tasksLoading
            ? 'Today’s tasks. Show list'
            : `${stillOpenRows.length} still open, ${comingUpCount} coming up. Show list`
        }
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <Icon name="arrow.right.to.line" size={16} color={color.accentInk} />
        <Text style={styles.bannerText}>
          <Text style={styles.bannerStrong}>
            {tasksLoading ? '…' : stillOpenRows.length} still open
          </Text>
          {` · ${tasksLoading ? '…' : comingUpCount} coming up`}
        </Text>
        <Icon name="chevron.up" size={14} color={color.accentInk} />
      </Pressable>

      {writingArea ? (
        <TodayNote
          key={`${writingArea}:${date}`}
          area={writingArea}
          date={date}
          today={today}
          onEmbeddedIds={onEmbeddedIds}
          appendEmbedRef={appendEmbedRef}
          onOpenTask={openTask}
        />
      ) : (
        <Text style={styles.hint}>
          Choose Work or Personal to write a daily note or act on tasks. All
          shows both areas, read-only.
        </Text>
      )}

      {date >= today && !loading.stillOpen ? (
        <Text style={styles.footer}>
          {'→ '}
          {buckets.carryCount === 0
            ? `Nothing carries over to ${weekdayName(addDays(date, 1), 'long')}`
            : `${buckets.carryCount === 1 ? '1 open task' : `${buckets.carryCount} open tasks`} will carry to ${weekdayName(addDays(date, 1), 'long')} if not done`}
        </Text>
      ) : null}

      <TodaySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        day={date}
        stillOpen={stillOpenRows}
        comingUp={buckets.comingUp}
        loading={tasksLoading}
        error={tasksError}
        readOnly={readOnly}
        onToggle={(task) => void toggle(task)}
        onOpenTask={(task) => {
          setSheetOpen(false);
          openTask(task.id);
        }}
        onOpenNote={(noteId) => {
          setSheetOpen(false);
          router.push(`/notes/${noteId}`);
        }}
        onMore={showMore}
        onAddToNote={canAddToNote ? addToNote : undefined}
      />
      <PickDateModal
        key={snoozing?.id ?? 'none'}
        title={snoozing ? 'Show this task on' : null}
        today={snoozeFrom}
        onCancel={() => setSnoozing(null)}
        onDone={(day) => {
          if (snoozing) {
            void patch(snoozing, { startDate: day, someday: false });
          }
          setSnoozing(null);
        }}
      />
    </ScrollView>
  );
};

export default TodayScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.surface },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[3],
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[3],
  },
  heading: { flexShrink: 1 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
  },
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
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[1] },
  navButton: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
  },
  navText: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.accent,
  },
  navTextDisabled: { color: color.muted },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    minHeight: MIN_TARGET,
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.md,
    backgroundColor: color.accentSoft,
  },
  pressed: { opacity: 0.7 },
  bannerText: {
    ...font.regular,
    flex: 1,
    fontSize: tokens.text.base,
    color: color.accentInk,
  },
  bannerStrong: { ...font.semibold },
  hint: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  footer: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    paddingTop: tokens.space[4],
  },
});
