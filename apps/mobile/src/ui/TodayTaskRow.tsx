import type { Task, TaskDue } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

type Props = {
  task: Pick<Task, 'id' | 'title' | 'status'>;
  /** Under the title: where it came from, or the day it starts. */
  detail?: string;
  due?: TaskDue | null;
  onOpen: () => void;
  onOpenDetail?: () => void;
  /** Read-only rows (All areas) have no checkbox action, + Note or ⋯. */
  onToggle?: () => void;
  onAddToNote?: () => void;
  /** Snooze and Drop. */
  onMore?: () => void;
};

/** A Still open or Coming up row on Today. */
export const TodayTaskRow = ({
  task,
  detail,
  due,
  onOpen,
  onOpenDetail,
  onToggle,
  onAddToNote,
  onMore,
}: Props) => {
  const done = task.status === 'done';
  const actions = [
    ...(onAddToNote ? [{ name: 'note', label: 'Add to today’s note' }] : []),
    ...(onMore ? [{ name: 'more', label: 'Snooze or drop' }] : []),
  ];
  return (
    <View style={styles.row}>
      {onToggle ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={
            done ? `Reopen ${task.title}` : `Complete ${task.title}`
          }
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggle();
          }}
          hitSlop={8}
          style={styles.box}
        >
          <Icon
            name={done ? 'checkmark.square.fill' : 'square'}
            size={22}
            color={done ? color.accent : color.inkSoft}
          />
        </Pressable>
      ) : null}
      <View style={styles.text}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[task.title, detail, due?.text]
            .filter(Boolean)
            .join(', ')}
          accessibilityHint="Opens the task"
          accessibilityActions={actions.length ? actions : undefined}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'note') onAddToNote?.();
            if (event.nativeEvent.actionName === 'more') onMore?.();
          }}
          onPress={onOpen}
          onLongPress={onMore}
        >
          <Text style={[styles.title, done && styles.done]} numberOfLines={2}>
            {task.title}
          </Text>
        </Pressable>
        {detail || due ? (
          <View style={styles.meta}>
            {detail ? (
              <Pressable
                onPress={onOpenDetail}
                disabled={!onOpenDetail}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.detail}>{detail}</Text>
              </Pressable>
            ) : null}
            {due ? (
              <Text
                style={[styles.detail, due.overdue && styles.overdue]}
                accessibilityElementsHidden
              >
                {due.text}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {onAddToNote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${task.title} to today’s note`}
          onPress={onAddToNote}
          style={styles.action}
        >
          <Text style={styles.actionText}>+ Note</Text>
        </Pressable>
      ) : null}
      {onMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${task.title}`}
          onPress={onMore}
          style={styles.action}
        >
          <Icon name="ellipsis" size={18} color={color.inkSoft} />
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TARGET + tokens.space[2],
    gap: tokens.space[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  box: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, paddingVertical: tokens.space[2], gap: 2 },
  title: { ...font.regular, fontSize: tokens.text.body, color: color.ink },
  done: { color: color.muted, textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] },
  detail: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  overdue: { color: color.alert },
  action: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    color: color.accent,
  },
});
