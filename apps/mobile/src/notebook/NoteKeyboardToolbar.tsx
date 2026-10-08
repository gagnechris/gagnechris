import type { TaskDateMenuItem } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import type { SFSymbol } from 'expo-symbols';
import {
  InputAccessoryView,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from '../ui/Icon';
import type { ToolbarAction } from './toolbarEdits';

export const NOTE_TOOLBAR_ID = 'note-keyboard-toolbar';

const BUTTONS: {
  action: ToolbarAction;
  label: string;
  icon?: SFSymbol;
  text?: string;
}[] = [
  { action: 'task', label: 'Task', icon: 'checkmark.square' },
  { action: 'date', label: 'Date', icon: 'calendar' },
  { action: 'priority', label: 'Priority', text: '!' },
  { action: 'heading', label: 'Heading', text: 'H' },
  { action: 'list', label: 'List', icon: 'list.bullet' },
  { action: 'link', label: 'Link', icon: 'link' },
];

type Props = {
  onAction: (action: ToolbarAction) => void;
  /** The date menu for the `@…` being typed on a task line, if any. */
  dateMenu: { heading: string; items: TaskDateMenuItem[] } | null;
  onPickDate: (item: TaskDateMenuItem) => void;
};

/** Sits on the keyboard: the date chips while typing `@`, then the buttons. */
export const NoteKeyboardToolbar = ({
  onAction,
  dateMenu,
  onPickDate,
}: Props) => (
  <InputAccessoryView nativeID={NOTE_TOOLBAR_ID}>
    <View style={styles.bar}>
      {dateMenu ? (
        <View accessibilityRole="menu" accessibilityLabel={dateMenu.heading}>
          <Text style={styles.heading}>{dateMenu.heading}</Text>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {dateMenu.items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="menuitem"
                accessibilityLabel={
                  item.detail ? `${item.label}, ${item.detail}` : item.label
                }
                onPress={() => onPickDate(item)}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.chipLabel}>{item.label}</Text>
                {item.detail ? (
                  <Text style={styles.chipDetail}>{item.detail}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.buttons} accessibilityRole="toolbar">
        {BUTTONS.map((button) => (
          <Pressable
            key={button.action}
            accessibilityRole="button"
            accessibilityLabel={button.label}
            onPress={() => onAction(button.action)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            {button.icon ? (
              <Icon name={button.icon} size={20} color={color.ink} />
            ) : (
              <Text style={styles.buttonText}>{button.text}</Text>
            )}
          </Pressable>
        ))}
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide keyboard"
          onPress={() => Keyboard.dismiss()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Icon
            name="keyboard.chevron.compact.down"
            size={20}
            color={color.ink}
          />
        </Pressable>
      </View>
    </View>
  </InputAccessoryView>
);

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  heading: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    paddingHorizontal: tokens.space[3],
    paddingTop: tokens.space[2],
  },
  chips: {
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
    minHeight: 36,
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipLabel: { ...font.semibold, fontSize: tokens.text.base, color: color.ink },
  chipDetail: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space[1],
  },
  button: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
  },
  buttonText: { ...font.bold, fontSize: tokens.text.body, color: color.ink },
  pressed: { backgroundColor: color.fill },
  spacer: { flex: 1 },
});
