import { tokens } from '@gagnechris/tokens';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

export type RowAction = { name: string; label: string; run: () => void };

type Props = {
  title: string;
  excerpt?: string;
  meta: string;
  divider?: boolean;
  onPress: () => void;
  /** Long press, the ⋯ button and VoiceOver's actions rotor all offer these. */
  actions: RowAction[];
  onShowActions: () => void;
};

export const NoteRow = ({
  title,
  excerpt,
  meta,
  divider,
  onPress,
  actions,
  onShowActions,
}: Props) => {
  const onAccessibilityAction = (event: AccessibilityActionEvent) =>
    actions.find((a) => a.name === event.nativeEvent.actionName)?.run();
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, excerpt, meta].filter(Boolean).join(', ')}
        accessibilityActions={actions.map(({ name, label }) => ({
          name,
          label,
        }))}
        onAccessibilityAction={onAccessibilityAction}
        onPress={onPress}
        onLongPress={onShowActions}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <Text style={styles.title}>{title}</Text>
        {excerpt ? <Text style={styles.excerpt}>{excerpt}</Text> : null}
        <Text style={styles.meta}>{meta}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${title}`}
        onPress={onShowActions}
        style={({ pressed }) => [styles.more, pressed && styles.pressed]}
      >
        <Icon name="ellipsis" size={18} color={color.muted} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  main: {
    flex: 1,
    minHeight: MIN_TARGET + 12,
    justifyContent: 'center',
    gap: 2,
    paddingLeft: tokens.space[4],
    paddingVertical: tokens.space[3],
  },
  pressed: { backgroundColor: color.fill },
  title: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.ink,
  },
  excerpt: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  meta: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.muted,
  },
  more: {
    minHeight: MIN_TARGET,
    minWidth: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
