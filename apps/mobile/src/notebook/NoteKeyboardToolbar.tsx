import type { TaskDateMenuItem } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import type { SFSymbol } from 'expo-symbols';
import {
  InputAccessoryView,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { color, font } from '../theme';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { PressArea } from '../ui/PressArea';
import type { ToolbarAction } from './toolbarEdits';

export const NOTE_TOOLBAR_ID = 'note-keyboard-toolbar';

export type ToolbarButton<A extends string = ToolbarAction> = {
  action: A;
  label: string;
  icon?: SFSymbol;
  text?: string;
};

const NOTE_BUTTONS: ToolbarButton[] = [
  { action: 'task', label: 'Task', icon: 'checkmark.square' },
  { action: 'date', label: 'Date', icon: 'calendar' },
  { action: 'priority', label: 'Priority', text: '!' },
  { action: 'heading', label: 'Heading', text: 'H' },
  { action: 'list', label: 'List', icon: 'list.bullet' },
  { action: 'link', label: 'Link', icon: 'link' },
];

type Props<A extends string> = {
  onAction: (action: A) => void;
  /** The date menu for the `@…` being typed on a task line, if any. */
  dateMenu?: { heading: string; items: TaskDateMenuItem[] } | null;
  onPickDate?: (item: TaskDateMenuItem) => void;
  buttons?: readonly ToolbarButton<A>[];
  nativeID?: string;
  /** `Keyboard.dismiss` only reaches a TextInput, not the live-preview view. */
  onHideKeyboard?: () => void;
};

/** Sits on the keyboard: the date chips while typing `@`, then the buttons. */
export const NoteKeyboardToolbar = <A extends string = ToolbarAction>({
  onAction,
  dateMenu,
  onPickDate,
  buttons = NOTE_BUTTONS as unknown as readonly ToolbarButton<A>[],
  nativeID = NOTE_TOOLBAR_ID,
  onHideKeyboard = Keyboard.dismiss,
}: Props<A>) => (
  <InputAccessoryView nativeID={nativeID}>
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
              <PressArea
                key={item.id}
                accessibilityRole="menuitem"
                accessibilityLabel={
                  item.detail ? `${item.label}, ${item.detail}` : item.label
                }
                onPress={() => onPickDate?.(item)}
                style={styles.chip}
              >
                <Text style={styles.chipLabel}>{item.label}</Text>
                {item.detail ? (
                  <Text style={styles.chipDetail}>{item.detail}</Text>
                ) : null}
              </PressArea>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.buttons} accessibilityRole="toolbar">
        {buttons.map((button) => (
          <IconButton
            key={button.action}
            size="lg"
            label={button.label}
            onPress={() => onAction(button.action)}
          >
            {button.icon ? (
              <Icon name={button.icon} size={20} color={color.ink} />
            ) : (
              <Text
                style={
                  button.text && button.text.length > 1
                    ? styles.wordText
                    : styles.buttonText
                }
              >
                {button.text}
              </Text>
            )}
          </IconButton>
        ))}
        <View style={styles.spacer} />
        <IconButton
          size="lg"
          label="Hide keyboard"
          onPress={() => onHideKeyboard()}
        >
          <Icon
            name="keyboard.chevron.compact.down"
            size={20}
            color={color.ink}
          />
        </IconButton>
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
  buttonText: { ...font.bold, fontSize: tokens.text.body, color: color.ink },
  wordText: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.ink,
    paddingHorizontal: tokens.space[2],
  },
  spacer: { flex: 1 },
});
