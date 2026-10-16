import type { Task } from '@gagnechris/app-core';
import type { TaskDue } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { isOpenStatus, useTaskParent } from '../notebook/taskParents';
import { Checkbox } from './Checkbox';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { TaskParentLabel } from './TaskParentLabel';

const CHIP_HEIGHT = 20;
// Grows the caption-sized note link to a 44pt target without moving the text.
const CHIP_SLOP = {
  top: (MIN_TARGET - CHIP_HEIGHT) / 2,
  bottom: (MIN_TARGET - CHIP_HEIGHT) / 2,
  left: 8,
  right: 8,
};

type Props = {
  task: Pick<Task, 'id' | 'title' | 'status'> & Partial<Pick<Task, 'parentId'>>;
  /** Under the title: where it came from, or the day it starts. */
  detail?: string;
  due?: TaskDue | null;
  /** Shown when not the default medium. */
  priority?: Task['priority'];
  onOpen: () => void;
  onOpenDetail?: () => void;
  /** Read-only rows (All areas) have no checkbox action, + Note or ⋯. */
  onToggle?: () => void;
  onAddToNote?: () => void;
  onMore?: () => void;
  /** VoiceOver's name for ⋯. */
  moreLabel?: string;
  onDoToday?: () => void;
};

export const TaskRow = ({
  task,
  detail,
  due,
  priority,
  onOpen,
  onOpenDetail,
  onToggle,
  onAddToNote,
  onMore,
  moreLabel = 'Snooze or drop',
  onDoToday,
}: Props) => {
  const parent = useTaskParent(task.parentId);
  const priorityText =
    priority === 'high' ? 'High' : priority === 'low' ? 'Low' : null;
  const done = task.status === 'done';
  const closed = done || task.status === 'dropped';
  const actions = [
    ...(onOpenDetail && detail
      ? [{ name: 'openNote', label: `Open ${detail}` }]
      : []),
    ...(onAddToNote ? [{ name: 'note', label: 'Add to today’s note' }] : []),
    ...(onDoToday ? [{ name: 'today', label: 'Do today' }] : []),
    ...(onMore ? [{ name: 'more', label: moreLabel }] : []),
  ];
  return (
    <View style={styles.row}>
      {onToggle ? (
        <Checkbox
          shape="round"
          label={closed ? `Reopen ${task.title}` : `Complete ${task.title}`}
          checked={done}
          dropped={task.status === 'dropped'}
          onChange={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggle();
          }}
        />
      ) : null}
      <Pressable
        style={styles.text}
        accessibilityRole="button"
        accessibilityLabel={[
          task.title,
          detail,
          due?.text,
          priorityText && `${priorityText} priority`,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Opens the task"
        accessibilityActions={actions.length ? actions : undefined}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === 'openNote') onOpenDetail?.();
          if (action === 'note') onAddToNote?.();
          if (action === 'today') onDoToday?.();
          if (action === 'more') onMore?.();
        }}
        onPress={onOpen}
        onLongPress={onMore}
      >
        {parent ? (
          <TaskParentLabel
            title={parent.title}
            finished={!isOpenStatus(parent.status)}
          />
        ) : null}
        <Text style={[styles.title, closed && styles.done]}>{task.title}</Text>
        {detail || due || priorityText ? (
          <View style={styles.meta}>
            {detail ? (
              <Pressable
                onPress={onOpenDetail}
                disabled={!onOpenDetail}
                // The row is one VoiceOver element; its Open action reaches
                // the note.
                accessibilityRole={onOpenDetail ? 'link' : undefined}
                accessibilityLabel={onOpenDetail ? `Open ${detail}` : undefined}
                hitSlop={CHIP_SLOP}
                style={styles.chip}
              >
                <Text style={styles.detail}>{detail}</Text>
              </Pressable>
            ) : null}
            {due ? (
              <Text style={[styles.detail, due.overdue && styles.overdue]}>
                {due.text}
              </Text>
            ) : null}
            {priorityText ? (
              <Text
                style={[styles.detail, priority === 'high' && styles.overdue]}
              >
                {priorityText}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
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
      {onDoToday ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Do ${task.title} today`}
          onPress={onDoToday}
          style={styles.action}
        >
          <Text style={styles.actionText}>Do today</Text>
        </Pressable>
      ) : null}
      {onMore ? (
        <IconButton size="lg" label={`More for ${task.title}`} onPress={onMore}>
          <Icon name="ellipsis" size={18} color={color.inkSoft} />
        </IconButton>
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
    paddingRight: tokens.space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  text: {
    flex: 1,
    minHeight: MIN_TARGET,
    justifyContent: 'center',
    paddingVertical: tokens.space[2],
    gap: 2,
  },
  chip: { minHeight: CHIP_HEIGHT, justifyContent: 'center' },
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
