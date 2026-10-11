import { useLatest } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import {
  NoteKeyboardToolbar,
  type ToolbarButton,
} from '../notebook/NoteKeyboardToolbar';
import { applyToolbarAction, type Selection } from '../notebook/toolbarEdits';
import { color, font } from '../theme';
import { insertImage } from './draftEdits';

type BodyAction = 'heading' | 'list' | 'link' | 'image';

const BUTTONS: readonly ToolbarButton<BodyAction>[] = [
  { action: 'heading', label: 'Heading', text: 'H' },
  { action: 'list', label: 'List', icon: 'list.bullet' },
  { action: 'link', label: 'Link', icon: 'link' },
  { action: 'image', label: 'Photo', icon: 'photo' },
];

const TOOLBAR_ID = 'admin-body-toolbar';

type Props = {
  value: string;
  onChange: (value: string) => void;
  addPhoto: (place: (path: string, alt: string) => void) => Promise<void>;
  uploading: boolean;
  autoFocus?: boolean;
};

/** A Markdown body with Heading, List, Link and Photo on the keyboard. */
export const MarkdownBodyField = ({
  value,
  onChange,
  addPhoto,
  uploading,
  autoFocus,
}: Props) => {
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  // The upload can finish after more typing; the photo goes into the text as it is then.
  const latest = useLatest(value);

  const onAction = (action: BodyAction) => {
    if (action === 'image') {
      const at = selection;
      void addPhoto((path, alt) => {
        const edit = insertImage(latest.current, at, alt, path);
        onChange(edit.text);
        setSelection(edit.selection);
      });
      return;
    }
    const edit = applyToolbarAction(value, selection, action);
    onChange(edit.text);
    setSelection(edit.selection);
  };

  return (
    <>
      <TextInput
        accessibilityLabel="Body"
        multiline
        scrollEnabled={false}
        value={value}
        onChangeText={onChange}
        selection={selection}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        inputAccessoryViewID={TOOLBAR_ID}
        placeholder="Write in Markdown…"
        placeholderTextColor={color.muted}
        autoFocus={autoFocus}
        style={styles.body}
      />
      {uploading ? (
        <Text style={styles.uploading} accessibilityLiveRegion="polite">
          Uploading photo…
        </Text>
      ) : null}
      <NoteKeyboardToolbar
        nativeID={TOOLBAR_ID}
        buttons={BUTTONS}
        onAction={onAction}
      />
    </>
  );
};

const styles = StyleSheet.create({
  body: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: 24,
    color: color.ink,
    minHeight: 240,
  },
  uploading: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
});
