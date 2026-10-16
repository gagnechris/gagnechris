import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type LiveMarkdownNativeProps = ViewProps & {
  value: string;
  mostRecentEventCount: number;
  /** JSON: `{ hash, lines }` for `value`, from `liveMarkdownDecorations`. */
  decorations: string;
  /** JSON: fonts, sizes and colors. */
  theme: string;
  /** `[request id, start, end]`; a new id moves the selection. */
  selectionRequest?: [number, number, number];
  focusRequest?: number;
  blurRequest?: number;
  placeholder?: string;
  textLabel?: string;
  inputAccessoryViewID?: string;
  editable?: boolean;
  autoFocus?: boolean;
  onChangeText?: (
    event: NativeSyntheticEvent<{
      text: string;
      eventCount: number;
      /** The selection in `text`. */
      selection: { start: number; end: number };
    }>,
  ) => void;
  onSelectionChange?: (
    event: NativeSyntheticEvent<{ selection: { start: number; end: number } }>,
  ) => void;
  onFocusChange?: (event: NativeSyntheticEvent<{ focused: boolean }>) => void;
  onContentHeight?: (event: NativeSyntheticEvent<{ height: number }>) => void;
  /** A tap on a link, except on the lines the caret is on. */
  onLinkPress?: (event: NativeSyntheticEvent<{ href: string }>) => void;
};

const expoGlobal = (
  globalThis as {
    expo?: { getViewConfig?: (moduleName: string) => unknown };
  }
).expo;

/**
 * Null in a binary built without the module (Expo Go, an older dev client),
 * where callers use a plain TextInput.
 */
export const LiveMarkdownNativeView: ComponentType<LiveMarkdownNativeProps> | null =
  expoGlobal?.getViewConfig?.('LiveMarkdown')
    ? requireNativeView<LiveMarkdownNativeProps>('LiveMarkdown')
    : null;
