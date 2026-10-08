import { useQuickAddTask } from '@gagnechris/app-core';
import type { NotebookAreaFilter, TaskLineDraft } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';

/** One line of task syntax: `Renew passport @nov 1 !high`. */
export const QuickAddTask = ({
  area,
  today,
  label,
  placeholder,
  hintAfterCreate,
}: {
  area: NotebookAreaFilter;
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
    if (await quickAdd.submit(text, today)) setText('');
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
          editable={!quickAdd.pending}
          autoCorrect={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add"
          accessibilityState={{ disabled: !canAdd }}
          disabled={!canAdd}
          onPress={() => void submit()}
          style={styles.add}
        >
          <Text style={[styles.addText, !canAdd && styles.disabled]}>
            {quickAdd.pending ? 'Adding…' : 'Add'}
          </Text>
        </Pressable>
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
  add: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[3],
  },
  addText: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.accent,
  },
  disabled: { color: color.muted },
  error: { ...font.medium, fontSize: tokens.text.caption, color: color.alert },
  hint: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
});
