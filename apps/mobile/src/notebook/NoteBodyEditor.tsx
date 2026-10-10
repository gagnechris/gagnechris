import { useLatest, type useNoteTaskEmbedSync } from '@gagnechris/app-core';
import {
  openTaskDateQuery,
  TASK_LINE_PREFIX,
  taskDateMenuItems,
  taskDateToken,
  tokenInsertion,
  type TaskDateMenuItem,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { color, font } from '../theme';
import { TaskEmbedRow } from '../ui/TaskEmbedRow';
import { createUlid } from '../ulid';
import { NOTE_TOOLBAR_ID, NoteKeyboardToolbar } from './NoteKeyboardToolbar';
import {
  convertTaskLine,
  lineAt,
  rebaseText,
  noteSegments,
  offsetOf,
  removeSegment,
  replaceSegmentText,
  segmentText,
  type NoteSegment,
} from './noteSegments';
import { PickDateModal } from './PickDateModal';
import {
  applyToolbarAction,
  type Selection,
  type ToolbarAction,
} from './toolbarEdits';

type Props = {
  markdown: string;
  onChange: (markdown: string) => void;
  embeds: ReturnType<typeof useNoteTaskEmbedSync>;
  today: string;
  onOpenTask: (id: string) => void;
  autoFocus?: boolean;
  /** Ids for tests; real ones are ULIDs. */
  newId?: () => string;
};

type Focus = { key: string; selection: Selection };
type TextSegment = Extract<NoteSegment, { kind: 'text' }>;

const textSegment = (segments: readonly NoteSegment[], key: string) =>
  segments.find((s): s is TextSegment => s.kind === 'text' && s.key === key);

/** The text run holding `line`; an empty run counts as holding its start. */
const segmentAtLine = (segments: readonly NoteSegment[], line: number) =>
  segments.find(
    (s): s is TextSegment =>
      s.kind === 'text' &&
      line >= s.start &&
      line < s.start + Math.max(s.lines.length, 1),
  );

type DateQuery = NonNullable<ReturnType<typeof openTaskDateQuery>>;

/**
 * The note body: plain markdown in native text views, with embedded tasks
 * as rows. A `[ ] …` line becomes a task when the caret leaves it.
 */
export const NoteBodyEditor = ({
  markdown,
  onChange,
  embeds,
  today,
  onOpenTask,
  autoFocus,
  newId = createUlid,
}: Props) => {
  const { onCreate, stateOf, error } = embeds;
  const segments = useMemo(() => noteSegments(markdown), [markdown]);
  const inputs = useRef(new Map<string, TextInput>());
  const [focus, setFocus] = useState<Focus | null>(null);
  const [picking, setPicking] = useState<{
    key: string;
    query: DateQuery;
  } | null>(null);
  // Where the caret was, by line of the whole note, and that line's text.
  const caretLine = useRef<{ line: number; text: string } | null>(null);
  const pendingSelection = useRef<Focus | null>(null);
  // Typing reports the new text before the new caret; until the caret
  // arrives, the old offset points into the wrong line.
  const caretStale = useRef(false);
  // iOS ignores a new value while keystrokes are in flight and reports
  // them against the text it still shows, which holds converted lines.
  const trims = useRef(new Map<string, string[]>());
  // The caret that follows such a keystroke counts from that stale start.
  const caretShift = useRef<{ key: string; by: number } | null>(null);
  const latest = useLatest({ markdown, segments, focus });

  const caretOf = (f: Focus) => {
    const segment = textSegment(latest.current.segments, f.key);
    if (!segment) return null;
    const { line, column } = lineAt(segmentText(segment), f.selection.end);
    return { line: segment.start + line, column };
  };

  /** Converts `line` if it is a task line; the caret, if given, follows. */
  const convert = (
    line: number,
    caret: { line: number; column: number } | null,
  ) => {
    const result = convertTaskLine(latest.current.markdown, line, today, newId);
    if (!result) return false;
    onCreate(result.create);
    onChange(result.markdown);
    const next = noteSegments(result.markdown);
    const key = latest.current.focus?.key;
    const before = key && textSegment(latest.current.segments, key);
    const after = key && textSegment(next, key);
    if (key && before && after) {
      const from = segmentText(before);
      const to = segmentText(after);
      // The run keeps its key for the lines after the converted one.
      if (to !== from && from.endsWith(to)) {
        const cut = from.slice(0, from.length - to.length);
        trims.current.set(key, [...(trims.current.get(key) ?? []), cut]);
      }
    }
    if (caret) {
      const target = segmentAtLine(next, caret.line);
      if (target) {
        const offset = offsetOf(
          target.lines,
          caret.line - target.start,
          caret.column,
        );
        const moved = {
          key: target.key,
          selection: { start: offset, end: offset },
        };
        pendingSelection.current = moved;
        setFocus(moved);
      }
      caretLine.current = {
        line: caret.line,
        text: result.markdown.split('\n')[caret.line] ?? '',
      };
    }
    return true;
  };

  // A `[ ] …` line is converted once the caret is on another line; its text
  // must still be what it was, so a joined or deleted line is left alone.
  const onCaretMoved = useEffectEvent(() => {
    if (!focus || caretStale.current) return;
    const caret = caretOf(focus);
    if (!caret) return;
    const lines = markdown.split('\n');
    const last = caretLine.current;
    caretLine.current = { line: caret.line, text: lines[caret.line] ?? '' };
    if (!last || last.line === caret.line || lines[last.line] !== last.text) {
      return;
    }
    convert(last.line, caret);
  });
  useEffect(() => onCaretMoved(), [focus, markdown]);

  useEffect(() => {
    const pending = pendingSelection.current;
    if (!pending) return;
    const input = inputs.current.get(pending.key);
    if (!input) return;
    pendingSelection.current = null;
    if (!input.isFocused?.()) input.focus?.();
    input.setSelection?.(pending.selection.start, pending.selection.end);
  });

  const onBlur = (key: string) => {
    const current = latest.current.focus;
    // The date sheet takes focus while the line is still being written.
    if (current?.key !== key || picking) return;
    const line = caretStale.current
      ? caretLine.current?.line
      : caretOf(current)?.line;
    setFocus(null);
    trims.current.clear();
    caretShift.current = null;
    caretLine.current = null;
    caretStale.current = false;
    if (line !== undefined) convert(line, null);
  };

  const onSelectionChange = (
    key: string,
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    const shift = caretShift.current?.key === key ? caretShift.current.by : 0;
    caretShift.current = null;
    const start = Math.max(0, event.nativeEvent.selection.start - shift);
    const end = Math.max(0, event.nativeEvent.selection.end - shift);
    caretStale.current = false;
    setFocus({ key, selection: { start, end } });
  };

  const edit = (key: string, text: string, selection?: Selection) => {
    onChange(replaceSegmentText(latest.current.segments, key, text));
    caretStale.current = !selection;
    if (selection) {
      const moved = { key, selection };
      pendingSelection.current = moved;
      setFocus(moved);
    }
  };

  const onChangeText = (key: string, text: string) => {
    const pending = trims.current.get(key);
    const segment = textSegment(latest.current.segments, key);
    if (!pending || !segment) return edit(key, text);
    const rebased = rebaseText(text, segmentText(segment), pending);
    if (rebased.pending.length) trims.current.set(key, rebased.pending);
    else trims.current.delete(key);
    caretShift.current = { key, by: text.length - rebased.text.length };
    edit(key, rebased.text);
  };

  const onAction = (action: ToolbarAction) => {
    if (!focus) return;
    const segment = textSegment(segments, focus.key);
    if (!segment) return;
    const result = applyToolbarAction(
      segmentText(segment),
      focus.selection,
      action,
    );
    edit(focus.key, result.text, result.selection);
  };

  const focusedText = focus ? textSegment(segments, focus.key) : undefined;
  const dateQuery = useMemo(() => {
    if (!focus || !focusedText) return null;
    const text = segmentText(focusedText);
    const caret = focus.selection.end;
    if (focus.selection.start !== caret) return null;
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
    if (!TASK_LINE_PREFIX.test(text.slice(lineStart))) return null;
    return openTaskDateQuery(text, caret, today);
  }, [focus, focusedText, today]);

  const insertToken = (key: string, query: DateQuery, token: string) => {
    const segment = textSegment(latest.current.segments, key);
    if (!segment) return;
    const text = segmentText(segment);
    const change = tokenInsertion(query, token, text.slice(query.to));
    edit(
      key,
      text.slice(0, change.from) + change.insert + text.slice(change.to),
      { start: change.caret, end: change.caret },
    );
  };

  const onPickDate = (item: TaskDateMenuItem) => {
    if (!dateQuery || !focus) return;
    if (item.token) insertToken(focus.key, dateQuery, item.token);
    else setPicking({ key: focus.key, query: dateQuery });
  };

  const removeEmbed = (key: string, title: string) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: ['Remove from note', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
        message: 'The task stays in your task list.',
      },
      (index) => {
        if (index === 0) {
          onChange(removeSegment(latest.current.segments, key));
        }
      },
    );

  const lastText = segments[segments.length - 1]!.key;

  return (
    <View style={styles.body}>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {segments.map((segment) => {
        if (segment.kind === 'embed') {
          const state = stateOf(segment.id);
          const title = state.kind === 'task' ? state.task.title : 'Task';
          return (
            <TaskEmbedRow
              key={segment.key}
              state={state}
              onOpen={
                state.kind === 'task' && state.saved
                  ? () => onOpenTask(segment.id)
                  : undefined
              }
              onRemove={() => removeEmbed(segment.key, title)}
            />
          );
        }
        const empty = segment.lines.length === 0;
        return (
          <TextInput
            key={segment.key}
            ref={(input) => {
              if (input) inputs.current.set(segment.key, input);
              else inputs.current.delete(segment.key);
            }}
            style={[styles.text, empty && styles.gap]}
            accessibilityLabel="Note body"
            placeholder={
              segment.key === lastText && segments.length === 1
                ? 'Write in markdown…'
                : undefined
            }
            placeholderTextColor={color.muted}
            value={segmentText(segment)}
            onChangeText={(text) => onChangeText(segment.key, text)}
            onSelectionChange={(event) => onSelectionChange(segment.key, event)}
            onBlur={() => onBlur(segment.key)}
            inputAccessoryViewID={NOTE_TOOLBAR_ID}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            autoFocus={autoFocus && segment.key === lastText}
          />
        );
      })}
      <NoteKeyboardToolbar
        onAction={onAction}
        dateMenu={
          dateQuery
            ? {
                heading:
                  dateQuery.kind === 'due' ? 'Deadline' : 'Show this task on',
                items: taskDateMenuItems(
                  today,
                  dateQuery.query,
                  dateQuery.kind,
                ),
              }
            : null
        }
        onPickDate={onPickDate}
      />
      <PickDateModal
        title={
          picking
            ? picking.query.kind === 'due'
              ? 'Deadline'
              : 'Show this task on'
            : null
        }
        today={today}
        onCancel={() => setPicking(null)}
        onDone={(day) => {
          setPicking(null);
          if (picking) {
            const { key, query } = picking;
            insertToken(
              key,
              query,
              taskDateToken(day, today, query.kind === 'due' ? 'due:' : '@'),
            );
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  body: { gap: tokens.space[1] },
  text: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: 24,
    color: color.ink,
  },
  gap: { minHeight: 24 },
  error: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.alert,
  },
});
