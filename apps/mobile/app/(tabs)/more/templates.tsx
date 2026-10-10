import {
  dailyTemplateResource,
  errorMessage,
  useResetDailyTemplateMutation,
  useVersionedDocEditor,
  type NotebookArea,
} from '@gagnechris/app-core';
import {
  DAILY_TEMPLATE_TASK_MESSAGE,
  dailyTemplateHasTasks,
  NOTEBOOK_AREA_LABELS,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useArea } from '../../../src/area';
import { nativeRetrySignals, useIsOnline } from '../../../src/net';
import {
  NoteKeyboardToolbar,
  type ToolbarButton,
} from '../../../src/notebook/NoteKeyboardToolbar';
import { saveLabel } from '../../../src/notebook/saveLabel';
import {
  applyToolbarAction,
  type Selection,
  type ToolbarAction,
} from '../../../src/notebook/toolbarEdits';
import { useSaveOnBackground } from '../../../src/notebook/useSaveOnBackground';
import { color, font } from '../../../src/theme';
import { nativeConfirm } from '../../../src/ui/confirm';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';

const AREAS: readonly NotebookArea[] = ['work', 'personal'];
const TOOLBAR_ID = 'template-keyboard-toolbar';

type TemplateAction = Extract<
  ToolbarAction,
  'heading' | 'list' | 'checklist' | 'dateToken'
>;

const BUTTONS: readonly ToolbarButton<TemplateAction | 'reset'>[] = [
  { action: 'heading', label: 'Heading', text: 'H' },
  { action: 'list', label: 'List', icon: 'list.bullet' },
  { action: 'checklist', label: 'Checklist', icon: 'checkmark.square' },
  { action: 'dateToken', label: 'Insert date', text: 'Insert date' },
  { action: 'reset', label: 'Reset to default', text: 'Reset' },
];

const TemplateEditor = ({ area }: { area: NotebookArea }) => {
  const online = useIsOnline();
  const editor = useVersionedDocEditor({
    resource: dailyTemplateResource,
    params: { area },
    initialDraft: { bodyMarkdown: '' },
    toDraft: (template) => ({ bodyMarkdown: template.bodyMarkdown }),
    getEntityId: (template) => template.area,
    toPayload: (draft) => ({ bodyMarkdown: draft.bodyMarkdown }),
    conflictMessage:
      'Another device changed this template. Go back and open it again.',
    loadErrorFallback: 'Could not load the template.',
    confirm: nativeConfirm,
    retrySignals: nativeRetrySignals,
  });
  const reset = useResetDailyTemplateMutation();
  const { draft, updateDraft, entity, dirty, saveState, save } = editor;
  useSaveOnBackground(dirty, save);
  // A task line is shown but never saved; autosave keeps the last valid text.
  const [invalidText, setInvalidText] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const text = invalidText ?? draft.bodyMarkdown;

  const onChange = (next: string) => {
    if (dailyTemplateHasTasks(next)) {
      setInvalidText(next);
      return;
    }
    setInvalidText(null);
    updateDraft(() => ({ bodyMarkdown: next }));
  };

  const onAction = (action: TemplateAction | 'reset') => {
    if (action === 'reset') {
      setInvalidText(null);
      void save().then(() => reset.mutate(area));
      return;
    }
    const edit = applyToolbarAction(text, selection, action);
    onChange(edit.text);
    setSelection(edit.selection);
  };

  if (editor.loadError) {
    return (
      <Text style={styles.error} accessibilityRole="alert">
        {editor.loadError}
      </Text>
    );
  }
  if (editor.isLoading || !entity) {
    return <Text style={styles.status}>Loading template…</Text>;
  }

  const label = NOTEBOOK_AREA_LABELS[area];
  const error =
    invalidText !== null
      ? DAILY_TEMPLATE_TASK_MESSAGE
      : (editor.saveError ??
        (reset.error
          ? errorMessage(reset.error, 'Could not reset the template.')
          : null));

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Text style={styles.saveState} accessibilityLiveRegion="polite">
              {saveLabel(saveState, dirty, !online)}
            </Text>
          ),
        }}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={`${label} template`}
        multiline
        scrollEnabled={false}
        value={text}
        onChangeText={onChange}
        selection={selection}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        inputAccessoryViewID={TOOLBAR_ID}
        placeholder="Write what each new day starts with…"
        placeholderTextColor={color.muted}
        style={styles.input}
      />
      <Text style={styles.hint}>
        New {label} notes start like this. Notes you’ve started don’t change.
        Checklists only, no tasks.
      </Text>
      <NoteKeyboardToolbar
        nativeID={TOOLBAR_ID}
        buttons={BUTTONS}
        onAction={onAction}
      />
    </>
  );
};

const DailyTemplatesScreen = () => {
  const { area: areaFilter } = useArea();
  const { template } = useLocalSearchParams<{ template?: string }>();
  const [area, setArea] = useState<NotebookArea>(
    template === 'work' || template === 'personal'
      ? template
      : areaFilter === 'all'
        ? 'work'
        : areaFilter,
  );
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <SegmentedControl
        label="Template"
        options={AREAS}
        labels={NOTEBOOK_AREA_LABELS}
        value={area}
        onChange={setArea}
      />
      <View style={styles.editor}>
        <TemplateEditor key={area} area={area} />
      </View>
    </ScrollView>
  );
};

export default DailyTemplatesScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.surface },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[8],
    gap: tokens.space[3],
  },
  editor: { gap: tokens.space[3] },
  input: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: 26,
    color: color.ink,
    minHeight: 240,
    paddingTop: 0,
  },
  hint: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  saveState: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    paddingVertical: tokens.space[6],
  },
});
