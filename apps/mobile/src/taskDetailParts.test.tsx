import { emptyTaskDraft, type TaskDraft } from '@gagnechris/app-core';
import { DEFAULT_NOTEBOOK_AREAS, formatTaskDay } from '@gagnechris/shared';
import { ActionSheetIOS } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allText, byLabel, render } from '../test/render';
import { PickDateModal } from './notebook/PickDateModal';
import { TaskActionBar } from './notebook/taskDetail/TaskActionBar';
import { TaskDescription } from './notebook/taskDetail/TaskDescription';
import { TaskFields } from './notebook/taskDetail/TaskFields';
import { useTaskDates } from './notebook/taskDetail/useTaskDates';

const TODAY = '2026-10-02';

let mounted: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  vi.clearAllMocks();
});

const open = async (element: React.JSX.Element) => {
  mounted = await render(element);
  return mounted;
};

const draftWith = (over: Partial<TaskDraft> = {}): TaskDraft => ({
  ...emptyTaskDraft(),
  title: 'Call Sam',
  ...over,
});

const choose = async (option: string) => {
  const [options, pick] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions)
    .mock.lastCall!;
  const index = options.options.findIndex((o) => o.startsWith(option));
  expect(index).toBeGreaterThanOrEqual(0);
  await act(async () => pick(index));
};

describe('TaskFields', () => {
  const fields = (
    draft: TaskDraft,
    props: Partial<Parameters<typeof TaskFields>[0]> = {},
  ) => (
    <TaskFields
      draft={draft}
      today={TODAY}
      onTitle={vi.fn()}
      onToggleDone={vi.fn()}
      setField={vi.fn()}
      onPickShowsOn={vi.fn()}
      onPickDeadline={vi.fn()}
      areas={DEFAULT_NOTEBOOK_AREAS}
      {...props}
    />
  );

  it('shows each field and sets a choice', async () => {
    const setField = vi.fn();
    const renderer = await open(
      fields(draftWith({ startDate: '2026-10-05', dueDate: '' }), { setField }),
    );
    expect(
      byLabel(renderer, `Shows on, ${formatTaskDay('2026-10-05')}`).props
        .onPress,
    ).toBeTypeOf('function');
    byLabel(renderer, 'Deadline, None');
    byLabel(renderer, 'Area, Work');
    byLabel(renderer, 'Status, Open');

    act(() => byLabel(renderer, 'Priority, Medium').props.onPress());
    await choose('High');
    expect(setField).toHaveBeenCalledWith({ priority: 'high' });
  });

  it('marks a done task and reopens it from the checkbox', async () => {
    const onToggleDone = vi.fn();
    const renderer = await open(
      fields(draftWith({ status: 'done', someday: true }), { onToggleDone }),
    );
    byLabel(renderer, 'Shows on, Someday');
    const box = byLabel(renderer, 'Reopen');
    expect(box.props.accessibilityState).toEqual({ checked: true });
    act(() => box.props.onPress());
    expect(onToggleDone).toHaveBeenCalledTimes(1);
  });
});

describe('TaskDescription', () => {
  it('edits the markdown and shows it rendered in Preview', async () => {
    const onChange = vi.fn();
    const renderer = await open(
      <TaskDescription
        description="**Bring** notes"
        onChange={onChange}
        preview={false}
        onTogglePreview={vi.fn()}
      />,
    );
    act(() => byLabel(renderer, 'Description').props.onChangeText('Hello'));
    expect(onChange).toHaveBeenCalledWith('Hello');

    act(() =>
      renderer.update(
        <TaskDescription
          description="**Bring** notes"
          onChange={onChange}
          preview
          onTogglePreview={vi.fn()}
        />,
      ),
    );
    expect(
      renderer.root.findAll(
        (node) => node.props.accessibilityLabel === 'Description',
      ),
    ).toHaveLength(0);
    expect(allText(renderer)).toContain('Bring');
    expect(byLabel(renderer, 'Preview').props.accessibilityState).toEqual({
      selected: true,
    });
  });
});

describe('TaskActionBar', () => {
  it('completes, reopens and snoozes', async () => {
    const onToggleDone = vi.fn();
    const onSnooze = vi.fn();
    const renderer = await open(
      <TaskActionBar
        done={false}
        onToggleDone={onToggleDone}
        onSnooze={onSnooze}
      />,
    );
    act(() => byLabel(renderer, 'Complete task').props.onPress());
    act(() => byLabel(renderer, 'Snooze').props.onPress());
    expect(onToggleDone).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledTimes(1);

    act(() =>
      renderer.update(
        <TaskActionBar done onToggleDone={onToggleDone} onSnooze={onSnooze} />,
      ),
    );
    expect(allText(renderer)).toContain('Reopen');
  });
});

describe('useTaskDates', () => {
  let dates: ReturnType<typeof useTaskDates>;
  const Harness = ({
    draft,
    setField,
  }: {
    draft: TaskDraft;
    setField: (change: Partial<TaskDraft>) => void;
  }) => {
    dates = useTaskDates({ draft, today: TODAY, setField });
    return dates.datePicker;
  };
  const picker = (renderer: ReactTestRenderer) =>
    renderer.root.findByType(PickDateModal);

  it('schedules from the sheet and from Pick a date…', async () => {
    const setField = vi.fn();
    const renderer = await open(
      <Harness draft={draftWith()} setField={setField} />,
    );
    expect(picker(renderer).props.title).toBeNull();

    act(() => dates.pickShowsOn('Snooze until'));
    await choose('Tomorrow');
    expect(setField).toHaveBeenLastCalledWith({
      startDate: '2026-10-03',
      someday: false,
    });

    act(() => dates.pickShowsOn('Show this task on'));
    await choose('Pick a date');
    expect(picker(renderer).props.title).toBe('Show this task on');
    act(() => picker(renderer).props.onDone('2026-10-20'));
    expect(setField).toHaveBeenLastCalledWith({
      startDate: '2026-10-20',
      someday: false,
    });
    expect(picker(renderer).props.title).toBeNull();
  });

  it('sets and clears the deadline', async () => {
    const setField = vi.fn();
    const renderer = await open(
      <Harness
        draft={draftWith({ dueDate: '2026-10-09' })}
        setField={setField}
      />,
    );
    act(() => dates.pickDeadline());
    await choose('Pick a date');
    expect(picker(renderer).props).toMatchObject({
      title: 'Deadline',
      today: '2026-10-09',
    });
    act(() => picker(renderer).props.onDone('2026-10-12'));
    expect(setField).toHaveBeenLastCalledWith({ dueDate: '2026-10-12' });

    act(() => dates.pickDeadline());
    await choose('No deadline');
    expect(setField).toHaveBeenLastCalledWith({ dueDate: '' });
  });
});
