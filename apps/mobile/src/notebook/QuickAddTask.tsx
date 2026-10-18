import { useQuickAddTask } from '@gagnechris/app-core';
import type { NotebookArea, TaskLineDraft } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { TextButton } from '../ui/TextButton';

/** One line of task syntax: `Renew passport @nov 1 !high`. */
export const QuickAddTask = ({
  area,
  today,
  label,
  placeholder,
  hintAfterCreate,
}: {
  area: NotebookArea;
  today: string;
  label: string;
  placeholder: string;
  hintAfterCreate?: (draft: TaskLineDraft) => string | null;
}) => {
  const [text, setText] = useState('');
  const quickAdd = useQuickAddTask(area, { hintAfterCreate });
  const canAdd = !quickAdd.pending && text.trim().length > 0;
  const submit = async () => {
    if (!canAdd) return;
    const sent = text;
    // The field stays editable (disabling it drops the keyboard), so keep
    // anything typed while the add was in flight.
    if (await quickAdd.submit(sent, today)) {
      setText((current) => (current === sent ? '' : current));
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          accessibilityLabel={label}
          placeholder={placeholder}
          placeholderTextColor={color.muted}
          value={text}
          onChangeText={(next) => {
            setText(next);
            quickAdd.clearMessages();
          }}
          onSubmitEditing={() => void submit()}
          submitBehavior="submit"
          returnKeyType="done"
          autoCorrect={false}
        />
        <TextButton
          strong
          size="base"
          padded
          accessibilityLabel="Add"
          disabled={!canAdd}
          onPress={() => void submit()}
        >
          {quickAdd.pending ? 'Adding…' : 'Add'}
        </TextButton>
      </View>
      {quickAdd.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {quickAdd.error}
        </Text>
      ) : quickAdd.hint ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {quickAdd.hint}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: tokens.space[1] },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TARGET,
    paddingLeft: tokens.space[3],
    borderRadius: tokens.radius.md + 2,
    backgroundColor: color.fill,
  },
  input: {
    flex: 1,
    minHeight: MIN_TARGET,
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
  },
  error: { ...font.medium, fontSize: tokens.text.caption, color: color.alert },
  hint: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
});
