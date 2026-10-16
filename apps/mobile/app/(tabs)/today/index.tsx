import {
  useTaskPatch,
  useTaskToggle,
  useTodayTasks,
  type Task,
} from '@gagnechris/app-core';
import {
  addDays,
  carryFooterText,
  formatCalendarDay,
  isCalendarDay,
  snoozeBaseDay,
  weekdayName,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArea } from '../../../src/area';
import { PickDateModal } from '../../../src/notebook/PickDateModal';
import { showSnoozeOrDrop } from '../../../src/notebook/taskActionSheets';
import { useDetailRoutes } from '../../../src/notebook/detailRoutes';
import { TodayNote } from '../../../src/notebook/TodayNote';
import { TodaySheet } from '../../../src/notebook/TodaySheet';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { AreaChip } from '../../../src/ui/AreaChip';
import { Icon } from '../../../src/ui/Icon';
import { IconButton } from '../../../src/ui/IconButton';

const TodayScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openTask, openNote } = useDetailRoutes();
  const today = useLocalToday();
  const { area, areaName, areas, setArea } = useArea();
  // Null follows the device's day, so midnight moves it on.
  const [picked, setPicked] = useState<string | null>(null);
  // A daily note opened from elsewhere (dailyNotePath) lands here.
  const params = useLocalSearchParams<{ date?: string; area?: string }>();
  const link =
    params.date || params.area ? `${params.date}|${params.area}` : null;
  const [seenLink, setSeenLink] = useState<string | null>(null);
  if (link !== seenLink) {
    setSeenLink(link);
    if (params.date && isCalendarDay(params.date)) setPicked(params.date);
  }
  useEffect(() => {
    if (!params.date && !params.area) return;
    const linked = params.area;
    if (linked && areas.some((a) => a.id === linked)) setArea(linked);
    router.setParams({ date: undefined, area: undefined });
  }, [params.date, params.area, areas, router, setArea]);
  // Midnight can make the picked day today; from then on, follow the device.
  if (picked === today) setPicked(null);
  const date = picked ?? today;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [snoozing, setSnoozing] = useState<Task | null>(null);
  const appendEmbedRef = useRef<((taskId: string) => void) | null>(null);

  const noteKey = `${area}:${date}`;
  const [embedded, setEmbedded] = useState<{
    key: string;
    ids: ReadonlySet<string> | null;
  } | null>(null);
  const onEmbeddedIds = useCallback(
    (ids: ReadonlySet<string> | null) => {
      setEmbedded({ key: noteKey, ids });
    },
    [noteKey],
  );
  const embeddedIds = embedded?.key === noteKey ? embedded.ids : null;

  const { buckets, stillOpenRows, loading, loadError } = useTodayTasks({
    area,
    day: date,
    embeddedIds,
  });
  const { toggle, error: toggleError } = useTaskToggle();
  const { patch, error: patchError } = useTaskPatch();
  const comingUpCount = buckets.comingUp.reduce(
    (n, d) => n + d.tasks.length,
    0,
  );
  const tasksLoading = loading.stillOpen || loading.comingUp;
  const tasksError = loadError
    ? 'Could not load tasks.'
    : (patchError ?? toggleError ?? null);
  const snoozeFrom = snoozeBaseDay(date, today);
  const canAddToNote = date === today;

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
  const carryText = carryFooterText(buckets.carryCount, addDays(date, 1));
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
          <AreaChip />
          <IconButton
            size="lg"
            label="Search"
            onPress={() => router.push('/search')}
          >
            <Icon name="magnifyingglass" size={20} color={color.ink} />
          </IconButton>
        </View>
      </View>
      <View style={styles.dayNav}>
        <IconButton
          size="lg"
          label="Previous day"
          onPress={() => goTo(addDays(date, -1))}
        >
          <Icon name="chevron.left" size={18} color={color.ink} />
        </IconButton>
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
        <IconButton
          size="lg"
          label="Next day"
          onPress={() => goTo(addDays(date, 1))}
        >
          <Icon name="chevron.right" size={18} color={color.ink} />
        </IconButton>
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

      <TodayNote
        key={noteKey}
        area={area}
        areaName={areaName}
        date={date}
        today={today}
        onEmbeddedIds={onEmbeddedIds}
        appendEmbedRef={appendEmbedRef}
        onOpenTask={openTask}
      />

      {date >= today && !loading.stillOpen ? (
        <Text style={styles.footer} accessibilityLabel={carryText}>
          {`→ ${carryText}`}
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
        onToggle={(task) => void toggle(task)}
        onOpenTask={(task) => {
          setSheetOpen(false);
          openTask(task.id);
        }}
        onOpenNote={(noteId) => {
          setSheetOpen(false);
          openNote(noteId);
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
  footer: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    paddingTop: tokens.space[4],
  },
});
