import type { TaskEmbedState } from '@gagnechris/app-core';
import type { Task } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

const TITLE_LINE = 24;

const PRIORITY_LABEL: Record<Task['priority'], string | null> = {
  high: 'High',
  med: null,
  low: 'Low',
};

type Props = {
  state: TaskEmbedState;
  onOpen?: () => void;
  /** Long press and the VoiceOver action; takes the line out of the note. */
  onRemove?: () => void;
};

const Pill = ({ text, tone }: { text: string; tone?: 'alert' | 'accent' }) => (
  <Text
    style={[
      styles.pill,
      tone === 'alert' && styles.pillAlert,
      tone === 'accent' && styles.pillAccent,
    ]}
  >
    {text}
  </Text>
);

export const TaskEmbedRow = ({ state, onOpen, onRemove }: Props) => {
  const removeActions = onRemove
    ? {
        accessibilityActions: [{ name: 'remove', label: 'Remove from note' }],
        onAccessibilityAction: () => onRemove(),
        onLongPress: onRemove,
      }
    : {};

  if (state.kind !== 'task') {
    const text =
      state.kind === 'loading'
        ? 'Loading task…'
        : state.kind === 'deleted'
          ? 'Deleted task'
          : `${state.title} · couldn’t save this task`;
    return (
      <View
        style={styles.row}
        accessibilityRole={state.kind === 'failed' ? 'alert' : undefined}
      >
        <Pressable
          style={styles.titleButton}
          accessibilityLabel={text}
          {...removeActions}
        >
          <Text style={[styles.title, styles.muted]}>{text}</Text>
        </Pressable>
        {state.kind === 'failed' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry saving ${state.title}`}
            onPress={state.onRetry}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const { task, schedule, due, pending, onToggle } = state;
  const done = task.status === 'done';
  const dropped = task.status === 'dropped';
  const priority = PRIORITY_LABEL[task.priority];
  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };
  const pills = [
    dropped ? 'Dropped' : null,
    schedule,
    due?.text,
    priority ? `${priority} priority` : null,
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: pending }}
        accessibilityLabel={
          done ? `Reopen ${task.title}` : `Complete ${task.title}`
        }
        disabled={pending}
        onPress={toggle}
        hitSlop={8}
        style={styles.box}
      >
        <Icon
          name={done ? 'checkmark.square.fill' : 'square'}
          size={22}
          color={done ? color.accent : color.inkSoft}
        />
      </Pressable>
      <Pressable
        style={styles.titleButton}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={[task.title, ...pills].join(', ')}
        accessibilityHint={onOpen ? 'Opens the task' : undefined}
        onPress={onOpen}
        disabled={!onOpen && !onRemove}
        {...removeActions}
      >
        <Text
          style={[styles.title, (done || dropped) && styles.closed]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        <View style={styles.pills}>
          {dropped ? <Pill text="Dropped" /> : null}
          {schedule ? <Pill text={schedule} tone="accent" /> : null}
          {due ? (
            <Pill text={due.text} tone={due.overdue ? 'alert' : undefined} />
          ) : null}
          {priority ? (
            <Pill
              text={priority}
              tone={task.priority === 'high' ? 'alert' : undefined}
            />
          ) : null}
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TARGET,
    gap: tokens.space[2],
  },
  box: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -tokens.space[2],
  },
  titleButton: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    // Yoga packs wrapped lines at the top, so without this the title sits
    // above the centered checkbox.
    alignContent: 'center',
    gap: tokens.space[2],
    minHeight: MIN_TARGET,
    // The same space above and below every row, so a row whose pills wrap is
    // spaced like a one-line row instead of touching the next one.
    paddingVertical: (MIN_TARGET - TITLE_LINE) / 2,
  },
  title: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: TITLE_LINE,
    color: color.ink,
    flexShrink: 1,
  },
  closed: { color: color.muted, textDecorationLine: 'line-through' },
  muted: { color: color.muted },
  pills: { flexDirection: 'row', gap: tokens.space[1] },
  pill: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    backgroundColor: color.fill,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[2],
    paddingVertical: 2,
    overflow: 'hidden',
  },
  pillAccent: { color: color.accentInk, backgroundColor: color.accentSoft },
  pillAlert: { color: color.alert },
  retry: { minHeight: MIN_TARGET, justifyContent: 'center' },
  retryText: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.accent,
  },
});
