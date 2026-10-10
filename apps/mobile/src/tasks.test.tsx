import { clearPendingFlushes } from '@gagnechris/app-core';
import { groupUpcomingTasks } from '@gagnechris/shared';
import { ActionSheetIOS } from 'react-native';
import {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TasksScreen from '../app/(tabs)/tasks/index';
import UpcomingScreen from '../app/(tabs)/upcoming/index';
import { Section } from './ui/Section';
import { makeTask, notebookServer } from '../test/notebookServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';

const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
const B = '01HTASKBBBBBBBBBBBBBBBBBBB';
const C = '01HTASKCCCCCCCCCCCCCCCCCCC';
const D = '01HTASKDDDDDDDDDDDDDDDDDDD';
const E = '01HTASKEEEEEEEEEEEEEEEEEEE';
const TODAY = '2026-10-02';

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer[] = [];

const serve = (...args: Parameters<typeof notebookServer>) => {
  server = notebookServer(...args);
  vi.stubGlobal('fetch', server.fetch);
};

beforeEach(() => {
  // Friday, Oct 2.
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
});

afterEach(() => {
  act(() => mounted.forEach((renderer) => renderer.unmount()));
  mounted = [];
  clearPendingFlushes();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const launch = async (Screen: () => React.JSX.Element) => {
  const renderer = await render(
    <Providers>
      <Screen />
    </Providers>,
  );
  mounted.push(renderer);
  await settle(15);
  return renderer;
};

const sectionTitles = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll(
      (node) =>
        (node.type as string) === 'Text' &&
        node.props.accessibilityRole === 'header',
    )
    .map((node) => node.props.children as string);

/** The section whose header reads `title`, to look for rows inside it. */
const section = (renderer: ReactTestRenderer, title: string) =>
  renderer.root.find(
    (node) => node.type === Section && node.props.title === title,
  );

const has = (root: ReactTestInstance, label: string) =>
  root.findAll(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  ).length;

const input = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'TextInput' &&
      node.props.accessibilityLabel === label,
  );

const quickAdd = async (
  renderer: ReactTestRenderer,
  label: string,
  text: string,
) => {
  act(() => input(renderer, label).props.onChangeText(text));
  await act(async () => byLabel(renderer, 'Add').props.onPress());
  await settle(10);
};

const swipe = async (
  renderer: ReactTestRenderer,
  title: string,
  dx: number,
) => {
  const row = renderer.root.find(
    (node) =>
      (node.type as string) === 'Animated.View' &&
      has(node, `Complete ${title}`) + has(node, `Reopen ${title}`) > 0,
  );
  await act(async () => row.props.onPanResponderRelease(null, { dx }));
  await settle(10);
};

const upcomingTasks = [
  makeTask(A, 'Pay rent', { startDate: '2026-10-03' }),
  makeTask(B, 'Dentist', { startDate: '2026-10-06', dueDate: '2026-10-07' }),
  makeTask(C, 'Renew passport', { startDate: '2026-10-20' }),
  makeTask(D, 'Learn Spanish', { someday: true }),
  makeTask(E, 'Already on Today'),
];

describe('Upcoming', () => {
  it('groups by show-on day, then Later and Someday, as web does', async () => {
    serve([], upcomingTasks);
    const renderer = await launch(UpcomingScreen);

    const expected = groupUpcomingTasks(upcomingTasks, TODAY).map(
      (g) => `${g.label} · ${g.sub}`,
    );
    expect(sectionTitles(renderer)).toEqual(
      expected.map((t) => t.toUpperCase()),
    );
    expect(expected.map((t) => t.split(' · ')[0])).toEqual([
      'Tomorrow',
      'Tuesday',
      'Later',
      'Someday',
    ]);
    expect(has(section(renderer, expected[0]!), 'Complete Pay rent')).toBe(1);
    expect(has(renderer.root, 'Complete Already on Today')).toBe(0);
    expect(allText(renderer)).toContain('Tue, Oct 20');
    expect(allText(renderer)).toContain('due Wed');
  });

  it('Do today moves a task out of Upcoming', async () => {
    serve([], upcomingTasks);
    const renderer = await launch(UpcomingScreen);
    await act(async () =>
      byLabel(renderer, 'Do Pay rent today').props.onPress(),
    );
    await settle(10);
    expect(server.state.taskStore.get(A)).toMatchObject({
      startDate: TODAY,
      someday: false,
    });
    expect(has(renderer.root, 'Complete Pay rent')).toBe(0);
  });

  it('quick add @tomorrow !high lands under Tomorrow with high priority', async () => {
    serve([], []);
    const renderer = await launch(UpcomingScreen);
    await quickAdd(renderer, 'Schedule a task', 'Call Sam @tomorrow !high');

    const created = [...server.state.taskStore.values()][0]!;
    expect(created).toMatchObject({
      title: 'Call Sam',
      startDate: '2026-10-03',
      priority: 'high',
      area: 'work',
    });
    const tomorrow = renderer.root.find(
      (node) =>
        node.type === Section &&
        String(node.props.title).startsWith('Tomorrow · '),
    );
    expect(has(tomorrow, 'Complete Call Sam')).toBe(1);
    expect(input(renderer, 'Schedule a task').props.value).toBe('');
  });

  it('a failed add shows an error and keeps the text', async () => {
    serve([], []);
    vi.stubGlobal('fetch', async (request: Request) =>
      request.method === 'POST' && request.url.endsWith('/tasks')
        ? new Response('{"error":"internal"}', { status: 500 })
        : server.fetch(request),
    );
    const renderer = await launch(UpcomingScreen);
    await quickAdd(renderer, 'Schedule a task', 'Call Sam @tomorrow !high');

    expect(allText(renderer)).toContain(
      'Could not add “Call Sam”. Please try again.',
    );
    expect(input(renderer, 'Schedule a task').props.value).toBe(
      'Call Sam @tomorrow !high',
    );
    expect(server.state.taskStore.size).toBe(0);
  });
});

describe('All tasks', () => {
  const tasks = [
    makeTask(A, 'Pay rent', { startDate: TODAY }),
    makeTask(B, 'Dentist', { startDate: '2026-10-06' }),
    makeTask(C, 'Old idea', { status: 'dropped' }),
    makeTask(D, 'Shipped it', { status: 'done', completedAt: TODAY }),
  ];

  it('lists open tasks, and Done and Dropped on their own', async () => {
    serve([], tasks);
    const renderer = await launch(TasksScreen);
    expect(has(renderer.root, 'Complete Pay rent')).toBe(1);
    expect(has(renderer.root, 'Complete Dentist')).toBe(1);
    expect(has(renderer.root, 'Reopen Shipped it')).toBe(0);

    await act(async () => byLabel(renderer, 'Done').props.onPress());
    await settle(10);
    expect(has(renderer.root, 'Reopen Shipped it')).toBe(1);
    expect(has(renderer.root, 'Complete Pay rent')).toBe(0);

    await act(async () => byLabel(renderer, 'Dropped').props.onPress());
    await settle(10);
    expect(has(renderer.root, 'Reopen Old idea')).toBe(1);
  });

  it('shows a deadline without a start date, and the priority', async () => {
    serve(
      [],
      [
        makeTask(E, 'File taxes', { dueDate: '2026-10-05', priority: 'high' }),
        makeTask(A, 'Water plants', { priority: 'low' }),
      ],
    );
    const renderer = await launch(TasksScreen);
    expect(allText(renderer)).toContain('High');
    expect(has(renderer.root, 'File taxes, due Mon, High priority')).toBe(1);
    expect(has(renderer.root, 'Water plants, Low priority')).toBe(1);
  });

  it('filters by show-on day', async () => {
    serve([], tasks);
    const renderer = await launch(TasksScreen);
    await act(async () => byLabel(renderer, 'After today').props.onPress());
    await settle(10);
    expect(has(renderer.root, 'Complete Dentist')).toBe(1);
    expect(has(renderer.root, 'Complete Pay rent')).toBe(0);
  });

  it('swipes right to complete and left to drop', async () => {
    serve([], tasks);
    const renderer = await launch(TasksScreen);
    await swipe(renderer, 'Pay rent', 120);
    expect(server.state.taskStore.get(A)!.status).toBe('done');
    expect(has(renderer.root, 'Complete Pay rent')).toBe(0);

    await swipe(renderer, 'Dentist', -40);
    expect(server.state.taskStore.get(B)!.status).toBe('todo');
    await swipe(renderer, 'Dentist', -120);
    expect(server.state.taskStore.get(B)!.status).toBe('dropped');
  });

  it('offers Complete and Drop as buttons too', async () => {
    serve([], tasks);
    const renderer = await launch(TasksScreen);
    act(() => byLabel(renderer, 'More for Dentist').props.onPress());
    const [options, choose] = vi.mocked(
      ActionSheetIOS.showActionSheetWithOptions,
    ).mock.lastCall!;
    expect(options.options).toEqual(['Complete', 'Drop', 'Cancel']);
    await act(async () => choose(1));
    await settle(10);
    expect(server.state.taskStore.get(B)!.status).toBe('dropped');

    await act(async () => byLabel(renderer, 'Dropped').props.onPress());
    await settle(10);
    await act(async () => byLabel(renderer, 'Reopen Dentist').props.onPress());
    await settle(10);
    expect(server.state.taskStore.get(B)!.status).toBe('todo');
  });

  it('quick add puts the task in the chosen area', async () => {
    serve([], []);
    const renderer = await launch(TasksScreen);
    await quickAdd(renderer, 'Quick add task', 'File taxes due:fri');
    expect([...server.state.taskStore.values()][0]).toMatchObject({
      title: 'File taxes',
      dueDate: '2026-10-09',
    });
    expect(has(renderer.root, 'Complete File taxes')).toBe(1);
  });
});
