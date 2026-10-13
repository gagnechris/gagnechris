import { tokens } from '@gagnechris/tokens';
import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  StyleSheet,
  TextInput,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputSelectionChangeEventData,
  type ViewStyle,
} from 'react-native';
import { LiveMarkdownNativeView } from '../../modules/live-markdown';
import { liveMarkdownDecorations } from '../markdown/liveDecorations';
import { color, font, readingFont } from '../theme';

export type LiveMarkdownHandle = {
  focus: () => void;
  blur: () => void;
  isFocused: () => boolean;
  setSelection: (start: number, end: number) => void;
};

/** Notes in Inter; posts and projects in the public reading style. */
export type LiveMarkdownVariant = 'note' | 'reading';

type Props = {
  ref?: Ref<LiveMarkdownHandle | null>;
  value: string;
  /** The native view sends the selection in `text`; a TextInput doesn't. */
  onChangeText: (
    text: string,
    selection?: { start: number; end: number },
  ) => void;
  onSelectionChange?: (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  variant: LiveMarkdownVariant;
  /** Shows a line holding only an image as the image, from this URL. */
  resolveImage?: (src: string) => string;
  /** Layout only; the variant sets the type. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  placeholder?: string;
  inputAccessoryViewID?: string;
  autoFocus?: boolean;
  editable?: boolean;
};

const MONO = 'Menlo';
const IMAGE_MAX_HEIGHT = 384;

const heading = (font: string, size: number, lineHeight: number) => ({
  font,
  size,
  lineHeight,
});

const sharedColors = {
  link: tokens.color.link,
  quote: tokens.neutral[700],
  bullet: tokens.neutral[600],
  codeBackground: tokens.neutral[100],
  fenceBackground: tokens.neutral[100],
  placeholder: color.muted,
  imagePlaceholder: tokens.neutral[100],
  syntax: tokens.neutral[500],
};

const THEMES: Record<LiveMarkdownVariant, string> = {
  note: JSON.stringify({
    body: heading(font.regular.fontFamily, tokens.text.body, 24),
    headings: [
      heading(font.bold.fontFamily, 27, 34),
      heading(font.bold.fontFamily, 22, 28),
      heading(font.semibold.fontFamily, 19, 26),
      heading(font.semibold.fontFamily, tokens.text.body, 24),
      heading(font.semibold.fontFamily, tokens.text.body, 24),
      heading(font.semibold.fontFamily, tokens.text.body, 24),
    ],
    strongFont: font.bold.fontFamily,
    emFont: null,
    codeFont: MONO,
    codeScale: 0.9,
    quoteIndent: tokens.space[3],
    imageMaxHeight: IMAGE_MAX_HEIGHT,
    colors: { ...sharedColors, text: color.ink },
  }),
  reading: JSON.stringify({
    body: heading(readingFont.regular.fontFamily, tokens.text.lead, 32),
    headings: [
      heading(readingFont.medium.fontFamily, 36, 45),
      heading(readingFont.medium.fontFamily, 32, 40),
      heading(readingFont.medium.fontFamily, 24, 30),
      heading(readingFont.medium.fontFamily, 21, 28),
      heading(readingFont.medium.fontFamily, tokens.text.lead, 32),
      heading(readingFont.medium.fontFamily, tokens.text.lead, 32),
    ],
    strongFont: readingFont.medium.fontFamily,
    emFont: readingFont.italic.fontFamily,
    codeFont: MONO,
    codeScale: 0.9,
    quoteIndent: tokens.space[3],
    imageMaxHeight: IMAGE_MAX_HEIGHT,
    colors: { ...sharedColors, text: tokens.color.prose },
  }),
};

const LINE_HEIGHT: Record<LiveMarkdownVariant, number> = {
  note: 24,
  reading: 32,
};

/**
 * A Markdown body that hides its syntax off the caret's lines and dims it on
 * them, through the native LiveMarkdown view. Without that view in the binary
 * it is a plain multiline TextInput with the same props.
 */
export const LiveMarkdownInput = (props: Props) =>
  LiveMarkdownNativeView ? (
    <NativeInput {...props} />
  ) : (
    <FallbackInput {...props} />
  );

const FallbackInput = ({
  ref,
  variant,
  style,
  resolveImage: _resolveImage,
  ...props
}: Props) => (
  <TextInput
    ref={ref as Ref<TextInput>}
    {...props}
    placeholderTextColor={color.muted}
    multiline
    scrollEnabled={false}
    textAlignVertical="top"
    style={[fallbackStyles[variant], style]}
  />
);

type Request = [number, number, number];

const NativeInput = ({
  ref,
  value,
  onChangeText,
  onSelectionChange,
  onFocus,
  onBlur,
  variant,
  resolveImage,
  style,
  accessibilityLabel,
  ...props
}: Props) => {
  const Native = LiveMarkdownNativeView!;
  const [eventCount, setEventCount] = useState(0);
  const focused = useRef(false);
  const [height, setHeight] = useState(LINE_HEIGHT[variant]);
  const [selectionRequest, setSelectionRequest] = useState<Request>();
  const [focusRequest, setFocusRequest] = useState(0);
  const [blurRequest, setBlurRequest] = useState(0);
  const decorations = useMemo(
    () => liveMarkdownDecorations(value, resolveImage),
    [value, resolveImage],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => setFocusRequest((n) => n + 1),
      blur: () => setBlurRequest((n) => n + 1),
      isFocused: () => focused.current,
      setSelection: (start, end) =>
        setSelectionRequest((current) => [(current?.[0] ?? 0) + 1, start, end]),
    }),
    [],
  );

  return (
    <Native
      {...props}
      style={[{ height }, style]}
      textLabel={accessibilityLabel}
      value={value}
      mostRecentEventCount={eventCount}
      decorations={decorations}
      theme={THEMES[variant]}
      selectionRequest={selectionRequest}
      focusRequest={focusRequest || undefined}
      blurRequest={blurRequest || undefined}
      onChangeText={(event) => {
        setEventCount(event.nativeEvent.eventCount);
        onChangeText(event.nativeEvent.text, event.nativeEvent.selection);
      }}
      onSelectionChange={(event) =>
        onSelectionChange?.(
          event as NativeSyntheticEvent<TextInputSelectionChangeEventData>,
        )
      }
      onFocusChange={(event) => {
        focused.current = event.nativeEvent.focused;
        if (focused.current) onFocus?.();
        else onBlur?.();
      }}
      onContentHeight={(event) =>
        setHeight(Math.max(LINE_HEIGHT[variant], event.nativeEvent.height))
      }
    />
  );
};

const fallbackStyles = StyleSheet.create({
  note: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: 24,
    color: color.ink,
  },
  reading: {
    ...readingFont.regular,
    fontSize: tokens.text.lead,
    lineHeight: 32,
    color: tokens.color.prose,
  },
});
