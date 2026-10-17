import {
  AUTOSAVE_DEBOUNCE_MS,
  type Task,
  type TaskEmbedState,
} from '@gagnechris/app-core';
import {
  findBareUrls,
  linkLabel,
  NOTEBOOK_TITLE_MAX_LENGTH,
  type BareUrl,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import * as Haptics from 'expo-haptics';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { openMarkdownLink } from '../markdown/links';
import { color, font, MIN_TARGET } from '../theme';
import type { Subtasks } from '../notebook/useNoteSubtasks';
import { Checkbox } from './Checkbox';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

const TITLE_LINE = 24;
// Longer than iOS's delay before Backspace starts repeating, so a held key
// that empties the title doesn't go on to delete the task.
const BACKSPACE_REPEAT_MS = 700;

const PRIORITY_LABEL: Record<Task['priority'], string | null> = {
  high: 'High',
  med: null,
  low: 'Low',
};

type Props = {
  state: TaskEmbedState;
  onOpen?: () => void;
  /** The VoiceOver Delete action, and long press without `onMenu`; asks first. */
  onRemove?: () => void;
  /** Long press and a VoiceOver action: the task's Move to, Indent… menu. */
  onMenu?: () => void;
  /** Backspace in an emptied title: deletes the line and its task. */
  onDelete?: () => void;
  /** The title is a text field when the task can be renamed. */
  editable?: boolean;
  /** Return in the title. */
  onTitleSubmit?: () => void;
  /** The drag grip, before the checkbox. */
  grip?: ReactNode;
  /** On a parent: its subtask count, which folds the lines under it. */
  subtasks?: Subtasks;
  /** With it, a chevron after the title opens and closes the task's details under the row. */
  onToggleDetails?: () => void;
  detailsOpen?: boolean;
};

const Pill = ({ text, tone }: { text: string; tone?: 'alert' | 'accent' }) => (
  <Text
    style={[
      styles.pill,
      tone === 'alert' && styles.pillAlert,
      tone === 'accent' && styles.pillAccent,
    ]}
  >
    {text}
  </Text>
);

const openUrl = (href: string) => void openMarkdownLink(href);

const LinkedTitle = ({ title, urls }: { title: string; urls: BareUrl[] }) => {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const { from, to, href } of urls) {
    parts.push(
      title.slice(at, from),
      <Text
        key={from}
        accessibilityRole="link"
        style={styles.link}
        onPress={() => openUrl(href)}
      >
        {title.slice(from, to)}
      </Text>,
    );
    at = to;
  }
  parts.push(title.slice(at));
  return <>{parts}</>;
};

// A text field can't hold links, so an editable title's URLs follow it.
const TitleLinks = ({ urls }: { urls: BareUrl[] }) =>
  urls.map(({ from, href }) => (
    <Pressable
      key={from}
      accessibilityRole="link"
      accessibilityLabel={linkLabel(href)}
      onPress={() => openUrl(href)}
      hitSlop={{ top: 8, bottom: 8 }}
      style={styles.linkChip}
    >
      <Text style={styles.linkChipText}>{linkLabel(href)}</Text>
    </Pressable>
  ));

type TitleProps = {
  title: string;
  closed: boolean;
  onRename: (title: string) => void;
  onSubmit?: () => void;
  onDelete?: () => void;
  inputRef: RefObject<TextInputInstance | null>;
  a11yActions: object;
  onEditing: (editing: boolean) => void;
};

type PendingTitle = {
  timer: ReturnType<typeof setTimeout> | null;
  text: string | null;
  save: (title: string) => void;
};

const savePending = (pending: PendingTitle) => {
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = null;
  const trimmed = pending.text?.trim();
  pending.text = null;
  if (trimmed) pending.save(trimmed);
};

/** Saves while typing and on blur; an emptied title goes back to the saved one. */
const TitleField = ({
  title,
  closed,
  onRename,
  onSubmit,
  onDelete,
  inputRef,
  a11yActions,
  onEditing,
}: TitleProps) => {
  // Null while not editing, so a rename from elsewhere shows at once.
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef<PendingTitle>({
    timer: null,
    text: null,
    save: onRename,
  });
  const lastBackspace = useRef(-Infinity);

  useEffect(() => {
    const current = pending.current;
    return () => savePending(current);
  }, []);

  const onChangeText = (text: string) => {
    setDraft(text);
    const p = pending.current;
    p.text = text;
    p.save = onRename;
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => savePending(p), AUTOSAVE_DEBOUNCE_MS);
  };

  return (
    <TextInput
      ref={inputRef}
      style={[styles.title, styles.titleField, closed && styles.closed]}
      accessibilityLabel="Task title"
      value={draft ?? title}
      onChangeText={onChangeText}
      onFocus={() => {
        setDraft(title);
        onEditing(true);
      }}
      onBlur={() => {
        savePending(pending.current);
        setDraft(null);
        onEditing(false);
      }}
      onSubmitEditing={onSubmit}
      onKeyPress={(e) => {
        if (e.nativeEvent.key !== 'Backspace' || !onDelete) return;
        const now = Date.now();
        const last = lastBackspace.current;
        lastBackspace.current = now;
        if ((draft ?? title) !== '' || now - last < BACKSPACE_REPEAT_MS) return;
        pending.current.text = null;
        onDelete();
      }}
      maxLength={NOTEBOOK_TITLE_MAX_LENGTH}
      // Wraps like the read-only title; Return ends editing instead of
      // adding a line break.
      multiline
      submitBehavior="blurAndSubmit"
      scrollEnabled={false}
      {...a11yActions}
    />
  );
};

export const TaskEmbedRow = ({
  state,
  onOpen,
  onRemove,
  onMenu,
  onDelete,
  editable,
  onTitleSubmit,
  onToggleDetails,
  detailsOpen = false,
  subtasks,
  grip,
}: Props) => {
  const titleInput = useRef<TextInputInstance>(null);
  // A long press in a title being edited is the text loupe, not the menu.
  const [editingTitle, setEditingTitle] = useState(false);
  const onLongPress = onMenu ?? onRemove;
  const actions = [
    ...(onMenu ? [{ name: 'menu', label: 'Task actions' }] : []),
    ...(onRemove ? [{ name: 'remove', label: 'Delete task' }] : []),
  ];
  /** VoiceOver can't reach a link inside the row's one element, so each is an action. */
  const accessibilityActions = (links: BareUrl[] = []) => {
    const all = [
      ...actions,
      ...links.map(({ href }, i) => ({
        name: `link:${i}`,
        label: `Open ${linkLabel(href)}`,
      })),
    ];
    return all.length
      ? {
          accessibilityActions: all,
          onAccessibilityAction: ({
            nativeEvent: { actionName },
          }: {
            nativeEvent: { actionName: string };
          }) => {
            const link = actionName.startsWith('link:')
              ? links[Number(actionName.slice('link:'.length))]
              : undefined;
            if (link) openUrl(link.href);
            else if (actionName === 'menu') onMenu?.();
            else onRemove?.();
          },
        }
      : {};
  };
  const a11yActions = accessibilityActions();
  const removeActions = onLongPress ? { ...a11yActions, onLongPress } : {};

  if (state.kind !== 'task') {
    const text =
      state.kind === 'loading'
        ? 'Loading task…'
        : state.kind === 'deleted'
          ? 'Deleted task'
          : `${state.title} · couldn’t save this task`;
    return (
      <View
        style={styles.row}
        accessibilityRole={state.kind === 'failed' ? 'alert' : undefined}
      >
        <Pressable
          style={styles.titleButton}
          accessibilityLabel={text}
          {...removeActions}
        >
          <Text style={[styles.title, styles.muted]}>{text}</Text>
        </Pressable>
        {state.kind === 'failed' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry saving ${state.title}`}
            onPress={state.onRetry}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const { task, schedule, due, pending, onToggle } = state;
  const urls = findBareUrls(task.title);
  const done = task.status === 'done';
  const dropped = task.status === 'dropped';
  const priority = PRIORITY_LABEL[task.priority];
  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };
  const allDone =
    subtasks !== undefined &&
    subtasks.done === subtasks.total &&
    !done &&
    !dropped;
  const pills = [
    allDone ? 'All done' : null,
    dropped ? 'Dropped' : null,
    schedule,
    due?.text,
    priority ? `${priority} priority` : null,
  ].filter(Boolean);
  const pillViews = (
    <>
      {allDone ? <Pill text="All done" tone="accent" /> : null}
      {dropped ? <Pill text="Dropped" /> : null}
      {schedule ? <Pill text={schedule} tone="accent" /> : null}
      {due ? (
        <Pill text={due.text} tone={due.overdue ? 'alert' : undefined} />
      ) : null}
      {priority ? (
        <Pill
          text={priority}
          tone={task.priority === 'high' ? 'alert' : undefined}
        />
      ) : null}
    </>
  );
  const checkbox = (
    <View style={styles.box}>
      <Checkbox
        shape="round"
        label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        checked={done}
        dropped={dropped}
        disabled={pending}
        onChange={toggle}
      />
    </View>
  );

  if (editable && state.onRename) {
    return (
      <View style={styles.row}>
        {grip}
        {checkbox}
        <Pressable
          style={styles.titleButton}
          accessible={false}
          onPress={() => titleInput.current?.focus()}
          onLongPress={editingTitle ? undefined : onLongPress}
        >
          <TitleField
            onEditing={setEditingTitle}
            title={task.title}
            closed={done || dropped}
            onRename={state.onRename}
            onSubmit={onTitleSubmit}
            onDelete={onDelete}
            inputRef={titleInput}
            a11yActions={a11yActions}
          />
          {onToggleDetails ? (
            <IconButton
              size="sm"
              label={`${detailsOpen ? 'Hide' : 'Show'} details for ${task.title}`}
              expanded={detailsOpen}
              onPress={onToggleDetails}
              onLongPress={onLongPress}
            >
              <Icon
                name={detailsOpen ? 'chevron.down' : 'chevron.right'}
                size={14}
                color={detailsOpen ? color.accent : color.muted}
              />
            </IconButton>
          ) : null}
          <TitleLinks urls={urls} />
          {pills.length ? (
            <View
              style={styles.pills}
              accessible
              accessibilityLabel={pills.join(', ')}
            >
              {pillViews}
            </View>
          ) : null}
        </Pressable>
        {subtasks ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${subtasks.done} of ${subtasks.total} subtasks done`}
            accessibilityHint={
              subtasks.folded ? 'Shows the subtasks' : 'Hides the subtasks'
            }
            accessibilityState={{ expanded: !subtasks.folded }}
            onPress={() => {
              // A subtask being edited is about to hide; the keyboard stays with the parent.
              if (
                !subtasks.folded &&
                TextInput.State?.currentlyFocusedInput?.()
              ) {
                titleInput.current?.focus();
              }
              subtasks.onToggleFold();
            }}
            hitSlop={{ top: 8, bottom: 8 }}
            style={styles.progress}
          >
            <Icon
              name={
                subtasks.done === subtasks.total
                  ? 'checkmark.circle.fill'
                  : subtasks.done > 0
                    ? 'circle.lefthalf.filled'
                    : 'circle'
              }
              size={14}
              color={color.accent}
            />
            <Text style={styles.progressText}>
              {`${subtasks.done} of ${subtasks.total}`}
            </Text>
            <Icon
              name={subtasks.folded ? 'chevron.right' : 'chevron.down'}
              size={10}
              color={color.muted}
            />
          </Pressable>
        ) : null}
        {onOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open task ${task.title}`}
            onPress={onOpen}
            onLongPress={onLongPress}
            style={styles.open}
          >
            <Icon
              name={onToggleDetails ? 'arrow.up.right' : 'chevron.right'}
              size={onToggleDetails ? 14 : 16}
              color={color.muted}
            />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {checkbox}
      <Pressable
        style={styles.titleButton}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={[task.title, ...pills].join(', ')}
        accessibilityHint={onOpen ? 'Opens the task' : undefined}
        onPress={onOpen}
        disabled={!onOpen && !onLongPress}
        {...(onLongPress ? { onLongPress } : {})}
        {...accessibilityActions(urls)}
      >
        <Text style={[styles.title, (done || dropped) && styles.closed]}>
          <LinkedTitle title={task.title} urls={urls} />
        </Text>
        <View style={styles.pills}>{pillViews}</View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TARGET,
    gap: tokens.space[2],
  },
  box: { marginLeft: -tokens.space[2] },
  titleButton: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    // Yoga packs wrapped lines at the top, so without this the title sits
    // above the centered checkbox.
    alignContent: 'center',
    gap: tokens.space[2],
    minHeight: MIN_TARGET,
    // The same space above and below every row, so a row whose pills wrap is
    // spaced like a one-line row instead of touching the next one.
    paddingVertical: (MIN_TARGET - TITLE_LINE) / 2,
  },
  title: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: TITLE_LINE,
    color: color.ink,
    flexShrink: 1,
  },
  // Drops the text view's own padding so the field sits where the title did.
  titleField: { paddingTop: 0, paddingBottom: 0, minWidth: 0 },
  closed: { color: color.muted, textDecorationLine: 'line-through' },
  muted: { color: color.muted },
  pills: { flexDirection: 'row', gap: tokens.space[1] },
  pill: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    backgroundColor: color.fill,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[2],
    paddingVertical: 2,
    overflow: 'hidden',
  },
  link: { color: tokens.color.link, textDecorationLine: 'underline' },
  linkChip: {
    minHeight: MIN_TARGET - tokens.space[4],
    justifyContent: 'center',
  },
  linkChipText: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: tokens.color.link,
    textDecorationLine: 'underline',
  },
  pillAccent: { color: color.accentInk, backgroundColor: color.accentSoft },
  pillAlert: { color: color.alert },
  open: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -tokens.space[2],
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TARGET - tokens.space[4],
  },
  progressText: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  retry: { minHeight: MIN_TARGET, justifyContent: 'center' },
  retryText: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.accent,
  },
});
