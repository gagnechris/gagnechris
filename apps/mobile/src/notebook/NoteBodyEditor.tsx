import { useLatest, type useNoteTaskEmbedSync } from '@gagnechris/app-core';
import {
  markdownPlainText,
  openTaskDateQuery,
  TASK_LINE_PREFIX,
  taskDateMenuItems,
  taskDateToken,
  tokenInsertion,
  type TaskDateMenuItem,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActionSheetIOS,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import {
  LiveMarkdownInput,
  type LiveMarkdownHandle,
} from '../ui/LiveMarkdownInput';
import { TaskEmbedRow } from '../ui/TaskEmbedRow';
import { createUlid } from '../ulid';
import { NOTE_TOOLBAR_ID, NoteKeyboardToolbar } from './NoteKeyboardToolbar';
import {
  convertTaskLines,
  endedLines,
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
import { TaskDetailsPanel } from './TaskDetailsPanel';
import { toggleTaskDetails, useTaskDetailsStore } from './taskDetailsStore';
import {
  applyToolbarAction,
  lineStart,
  type Selection,
  type ToolbarAction,
} from './toolbarEdits';

type Props = {
  markdown: string;
  onChange: (markdown: string) => void;
  embeds: ReturnType<typeof useNoteTaskEmbedSync>;
  today: string;
  onOpenTask: (id: string) => void;
  /** Whether rows show their first details line is kept per note. */
  noteId?: string;
  autoFocus?: boolean;
  /** Ids for tests; real ones are ULIDs. */
  newId?: () => string;
};

const CONVERT_AFTER_MS = 400;

const firstLine = (markdown: string) =>
  markdownPlainText(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? null;

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
 * The note body: plain markdown in live-preview text views, with embedded
 * tasks as rows. A `[ ] …` line becomes a task when the caret leaves it.
 */
export const NoteBodyEditor = ({
  markdown,
  onChange,
  embeds,
  today,
  onOpenTask,
  noteId,
  autoFocus,
  newId = createUlid,
}: Props) => {
  const { onCreate, stateOf, error } = embeds;
  const details = useTaskDetailsStore();
  const peeking = noteId ? details.peek.has(noteId) : false;
  const segments = useMemo(() => noteSegments(markdown), [markdown]);
  const inputs = useRef(new Map<string, LiveMarkdownHandle>());
  const [focus, setFocus] = useState<Focus | null>(null);
  const [picking, setPicking] = useState<{
    key: string;
    query: DateQuery;
  } | null>(null);
  // Where the caret was, by line of the whole note, and that line's text.
  const caretLine = useRef<{ line: number; text: string } | null>(null);
  const pendingSelection = useRef<Focus | null>(null);
  // A TextInput reports the new text before the new caret; until the caret
  // arrives, the old offset points into the wrong line.
  const caretStale = useRef(false);
  // iOS ignores a new value while keystrokes are in flight and reports
  // them against the text it still shows, which holds converted lines.
  const trims = useRef(new Map<string, string[]>());
  // Lines left behind by Return or the caret, converted once typing pauses
  // so the text view has taken every keystroke before its text changes.
  const queued = useRef(new Map<number, string>());
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useLatest({ markdown, segments, focus });

  const caretOf = (f: Focus) => {
    const segment = textSegment(latest.current.segments, f.key);
    if (!segment) return null;
    const { line, column } = lineAt(segmentText(segment), f.selection.end);
    return { line: segment.start + line, column };
  };

  /** Converts the queued task lines; the caret, if given, follows. */
  const flush = (caret: { line: number; column: number } | null) => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    const lines = [...queued.current].filter(([line]) => line !== caret?.line);
    queued.current.clear();
    const result = convertTaskLines(
      latest.current.markdown,
      lines,
      today,
      newId,
    );
    if (!result) return;
    result.creates.forEach(onCreate);
    onChange(result.markdown);
    const next = noteSegments(result.markdown);
    const key = latest.current.focus?.key;
    const before = key && textSegment(latest.current.segments, key);
    const after = key && textSegment(next, key);
    if (key && before && after) {
      const from = segmentText(before);
      const to = segmentText(after);
      // The run keeps its key for the lines after the converted ones.
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
  };

  const onIdle = useLatest(() => {
    const { focus: current } = latest.current;
    flush(current && !caretStale.current ? caretOf(current) : null);
  });

  const schedule = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = queued.current.size
      ? setTimeout(() => onIdle.current(), CONVERT_AFTER_MS)
      : null;
  };

  const queue = (line: number, text: string) => {
    queued.current.set(line, text);
    schedule();
  };

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

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
    queue(last.line, last.text);
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
    if (line !== undefined) {
      queued.current.set(line, latest.current.markdown.split('\n')[line]!);
    }
    flush(null);
    setFocus(null);
    trims.current.clear();
    caretLine.current = null;
    caretStale.current = false;
  };

  const onSelectionChange = (
    key: string,
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    const { start, end } = event.nativeEvent.selection;
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

  const onChangeText = (key: string, typed: string, caret?: Selection) => {
    const segment = textSegment(latest.current.segments, key);
    if (!segment) return edit(key, typed);
    const before = segmentText(segment);
    const pending = trims.current.get(key);
    let text = typed;
    if (pending) {
      const rebased = rebaseText(typed, before, pending);
      if (rebased.pending.length) trims.current.set(key, rebased.pending);
      else trims.current.delete(key);
      text = rebased.text;
    }
    edit(key, text);
    if (caret) {
      // Rebasing only drops lines from the start of what the view holds.
      const shift = typed.length - text.length;
      caretStale.current = false;
      setFocus({
        key,
        selection: {
          start: Math.max(0, caret.start - shift),
          end: Math.max(0, caret.end - shift),
        },
      });
    }
    const lines = text.split('\n');
    for (const line of endedLines(before, text)) {
      queued.current.set(segment.start + line, lines[line]!);
    }
    // Every keystroke pushes conversion back until typing pauses.
    schedule();
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
    const from = lineStart(text, caret);
    if (!TASK_LINE_PREFIX.test(text.slice(from))) return null;
    return openTaskDateQuery(text, caret, today);
  }, [focus, focusedText, today]);

  const dateMenu = dateQuery
    ? {
        heading: dateQuery.kind === 'due' ? 'Deadline' : 'Show this task on',
        items: taskDateMenuItems(today, dateQuery.query, dateQuery.kind),
      }
    : null;

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

  const deleteEmbed = (key: string, id: string) => {
    onChange(removeSegment(latest.current.segments, key));
    embeds.onRemoved([id]);
  };

  const confirmDeleteEmbed = (key: string, id: string, title: string) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: ['Delete task', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
        message: 'Takes it out of this note and your task list.',
      },
      (index) => {
        if (index === 0) deleteEmbed(key, id);
      },
    );

  /** Puts the caret on a blank line right under the embed at `key`. */
  const continueAfter = (key: string) => {
    const all = latest.current.segments;
    const next = all[all.findIndex((s) => s.key === key) + 1];
    if (next?.kind !== 'text') return;
    const caret = { start: 0, end: 0 };
    if (next.lines.length === 0 || next.lines[0] === '') {
      const moved = { key: next.key, selection: caret };
      pendingSelection.current = moved;
      setFocus(moved);
    } else {
      edit(next.key, `\n${segmentText(next)}`, caret);
    }
  };

  const lastText = segments[segments.length - 1]!.key;

  return (
    <View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {segments.map((segment, index) => {
        if (segment.kind === 'embed') {
          const state = stateOf(segment.id);
          const title = state.kind === 'task' ? state.task.title : 'Task';
          const saved = state.kind === 'task' ? state.saved : undefined;
          const open = Boolean(saved) && details.open.has(segment.id);
          const peek =
            saved && !open && peeking ? firstLine(saved.description) : null;
          return (
            <Fragment key={segment.key}>
              <TaskEmbedRow
                state={state}
                onOpen={saved ? () => onOpenTask(segment.id) : undefined}
                onRemove={() =>
                  confirmDeleteEmbed(segment.key, segment.id, title)
                }
                onDelete={() => deleteEmbed(segment.key, segment.id)}
                editable
                onTitleSubmit={() => continueAfter(segment.key)}
                onToggleDetails={
                  saved ? () => toggleTaskDetails(segment.id) : undefined
                }
                detailsOpen={open}
              />
              {saved && open ? (
                <TaskDetailsPanel task={saved} today={today} />
              ) : null}
              {peek ? (
                <Text style={styles.peek} numberOfLines={1}>
                  {peek}
                </Text>
              ) : null}
            </Fragment>
          );
        }
        const empty = segment.lines.length === 0;
        // An empty run between tasks stays a thin strip to tap into, so a
        // list of tasks reads like one.
        const collapsed =
          empty && segment.key !== lastText && focus?.key !== segment.key;
        // iOS gives an accessory to the first input with its id, once, when
        // the accessory mounts, so each run has its own.
        const toolbarId = `${NOTE_TOOLBAR_ID}-${segment.key}`;
        return (
          <Fragment key={segment.key}>
            <LiveMarkdownInput
              ref={(input) => {
                if (input) inputs.current.set(segment.key, input);
                else inputs.current.delete(segment.key);
              }}
              variant="note"
              style={[
                empty && styles.gap,
                collapsed && styles.collapsed,
                collapsed && index > 0 && styles.collapsedBelowRow,
              ]}
              accessibilityLabel="Note body"
              placeholder={
                segment.key === lastText && segments.length === 1
                  ? 'Write in markdown…'
                  : undefined
              }
              value={segmentText(segment)}
              onChangeText={(text, caret) =>
                onChangeText(segment.key, text, caret)
              }
              onSelectionChange={(event) =>
                onSelectionChange(segment.key, event)
              }
              onBlur={() => onBlur(segment.key)}
              inputAccessoryViewID={toolbarId}
              autoFocus={autoFocus && segment.key === lastText}
            />
            <NoteKeyboardToolbar
              nativeID={toolbarId}
              onAction={onAction}
              onHideKeyboard={() => inputs.current.get(segment.key)?.blur()}
              dateMenu={focus?.key === segment.key ? dateMenu : null}
              onPickDate={onPickDate}
            />
          </Fragment>
        );
      })}
      <PickDateModal
        key={picking ? 'picking' : 'closed'}
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

const STRIP = tokens.space[1];
const STRIP_OVERLAP = tokens.space[2];

const styles = StyleSheet.create({
  gap: { minHeight: 24 },
  // The strip reaches into the padding of the task rows around it and sits
  // above them, so it is easy to tap without spreading the rows apart.
  collapsed: {
    minHeight: 0,
    height: STRIP + STRIP_OVERLAP,
    marginBottom: -STRIP_OVERLAP,
    paddingTop: 0,
    paddingBottom: 0,
    zIndex: 1,
  },
  collapsedBelowRow: {
    height: STRIP + 2 * STRIP_OVERLAP,
    marginTop: -STRIP_OVERLAP,
  },
  peek: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.muted,
    marginTop: -tokens.space[2],
    marginLeft: MIN_TARGET - tokens.space[2],
  },
  error: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.alert,
  },
});
