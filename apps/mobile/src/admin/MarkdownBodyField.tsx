import { useLatest } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { resolveMarkdownUrl } from '../markdown/links';
import {
  NoteKeyboardToolbar,
  type ToolbarButton,
} from '../notebook/NoteKeyboardToolbar';
import {
  applyToolbarAction,
  type Selection,
  type TextEdit,
} from '../notebook/toolbarEdits';
import { color, font } from '../theme';
import {
  LiveMarkdownInput,
  type LiveMarkdownHandle,
} from '../ui/LiveMarkdownInput';
import { insertImage } from './draftEdits';

type BodyAction =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'link'
  | 'image'
  | 'code'
  | 'list'
  | 'preview';

const BUTTONS: readonly ToolbarButton<BodyAction>[] = [
  { action: 'heading', label: 'Heading', text: 'H' },
  { action: 'bold', label: 'Bold', icon: 'bold' },
  { action: 'italic', label: 'Italic', icon: 'italic' },
  { action: 'link', label: 'Link', icon: 'link' },
  { action: 'image', label: 'Photo', icon: 'photo' },
  {
    action: 'code',
    label: 'Code',
    icon: 'chevron.left.forwardslash.chevron.right',
  },
  { action: 'list', label: 'List', icon: 'list.bullet' },
  { action: 'preview', label: 'Preview', icon: 'eye' },
];

const TOOLBAR_ID = 'admin-body-toolbar';

type Props = {
  value: string;
  onChange: (value: string) => void;
  addPhoto: (place: (path: string, alt: string) => void) => Promise<void>;
  uploading: boolean;
  onPreview: () => void;
  /** What root-relative image paths load from. */
  siteOrigin: string;
  autoFocus?: boolean;
};

/**
 * A Markdown body in the public reading style, with Heading, Bold, Italic,
 * Link, Photo, Code, List and Preview on the keyboard.
 */
export const MarkdownBodyField = ({
  value,
  onChange,
  addPhoto,
  uploading,
  onPreview,
  siteOrigin,
  autoFocus,
}: Props) => {
  const input = useRef<LiveMarkdownHandle>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const pending = useRef<Selection | null>(null);
  // The upload can finish after more typing; the photo goes into the text as it is then.
  const latest = useLatest(value);
  const [resolveImage] = useState(
    () => (src: string) => resolveMarkdownUrl(src, siteOrigin) ?? '',
  );

  // The selection moves once the edited text has reached the view.
  useEffect(() => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    input.current?.setSelection(next.start, next.end);
  });

  const apply = (edit: TextEdit) => {
    onChange(edit.text);
    setSelection(edit.selection);
    pending.current = edit.selection;
  };

  const onAction = (action: BodyAction) => {
    if (action === 'preview') return onPreview();
    if (action === 'image') {
      const at = selection;
      void addPhoto((path, alt) =>
        apply(insertImage(latest.current, at, alt, path)),
      );
      return;
    }
    apply(applyToolbarAction(value, selection, action));
  };

  return (
    <>
      <LiveMarkdownInput
        ref={input}
        variant="reading"
        resolveImage={resolveImage}
        accessibilityLabel="Body"
        value={value}
        onChangeText={onChange}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        inputAccessoryViewID={TOOLBAR_ID}
        placeholder="Write in Markdown…"
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
  body: { minHeight: 240 },
  uploading: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
});
