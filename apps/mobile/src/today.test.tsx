import { clearPendingFlushes } from '@gagnechris/app-core';
import { ActionSheetIOS } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TodayScreen from '../app/(tabs)/today/index';
import { databases } from '../test/expoSqlite';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { stopOutbox } from './outbox';

const YESTERDAY_NOTE = '01YESTERDAYNOTE00000000000';
const TODAY_NOTE = '01TODAYNOTE000000000000000';
const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
const B = '01HTASKBBBBBBBBBBBBBBBBBBB';
const C = '01HTASKCCCCCCCCCCCCCCCCCCC';

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer[] = [];

let releaseTaskWrites: (() => void) | null = null;

const serve = (...args: Parameters<typeof notebookServer>) => {
  server = notebookServer(...args);
  vi.stubGlobal('fetch', server.fetch);
};

/** Task writes wait until released, so a test can look before the server answers. */
const holdTaskWrites = () => {
  const gate = new Promise<void>((resolve) => {
    releaseTaskWrites = resolve;
  });
  vi.stubGlobal('fetch', async (request: Request) => {
    if (request.method === 'PUT' && request.url.includes('/tasks/')) {
      await gate;
    }
    return server.fetch(request);
  });
};

beforeEach(() => {
  // Friday, Oct 2, the morning after Thursday's note.
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
});

afterEach(async () => {
  act(() => mounted.forEach((renderer) => renderer.unmount()));
  mounted = [];
  await stopOutbox();
  databases.clear();
  clearPendingFlushes();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** A fresh app: its own query cache, as after a relaunch. */
const launch = async () => {
  const renderer = await render(
    <Providers>
      <TodayScreen />
    </Providers>,
  );
  mounted.push(renderer);
  await settle(15);
  return renderer;
};

const banner = (renderer: ReactTestRenderer) =>
  renderer.root.find(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.endsWith('Show list'),
  );

const openSheet = async (renderer: ReactTestRenderer) => {
  await act(async () => banner(renderer).props.onPress());
};

const labelled = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );

const yesterdaysTask = makeTask(A, 'Call Sam', {
  noteId: YESTERDAY_NOTE,
  createdAt: '2026-10-01T15:00:00.000Z',
});
const yesterdaysNote = makeNote(YESTERDAY_NOTE, `{{task:${A}}}`, {
  type: 'daily',
  date: '2026-10-01',
  title: '',
});

describe('Today', () => {
  it('shows an unchecked task from yesterday’s note as Still open, without writing anything', async () => {
    serve([yesterdaysNote], [yesterdaysTask]);
    const renderer = await launch();

    expect(banner(renderer).props.accessibilityLabel).toBe(
      '1 still open, 0 coming up. Show list',
    );
    await openSheet(renderer);
    expect(labelled(renderer, 'Complete Call Sam')).toHaveLength(1);
    expect(allText(renderer)).toContain('Thu note · 1 day');
    expect(server.state.writes).toBe(0);
    expect(allText(renderer)).toContain(
      '1 open task will carry to Saturday if not done',
    );
  });

  it('snoozes a row away at once, and it stays away after a relaunch', async () => {
    serve([yesterdaysNote], [yesterdaysTask]);
    const renderer = await launch();
    await openSheet(renderer);
    holdTaskWrites();

    act(() => byLabel(renderer, 'More for Call Sam').props.onPress());
    const sheets = vi.mocked(ActionSheetIOS.showActionSheetWithOptions);
    act(() => sheets.mock.lastCall![1](0));
    const [snooze, chooseDay] = sheets.mock.lastCall!;
    expect(snooze.options[0]).toMatch(/^Tomorrow · /);
    await act(async () => chooseDay(0));
    expect(labelled(renderer, 'Complete Call Sam')).toHaveLength(0);
    expect(server.state.taskStore.get(A)!.startDate).toBeNull();
    releaseTaskWrites!();
    await settle();
    expect(server.state.taskStore.get(A)).toMatchObject({
      startDate: '2026-10-03',
      someday: false,
    });

    const relaunched = await launch();
    expect(banner(relaunched).props.accessibilityLabel).toBe(
      '0 still open, 1 coming up. Show list',
    );
  });

  it('drops a row at once, and it stays dropped after a relaunch', async () => {
    serve([yesterdaysNote], [yesterdaysTask]);
    const renderer = await launch();
    await openSheet(renderer);
    holdTaskWrites();

    act(() => byLabel(renderer, 'More for Call Sam').props.onPress());
    await act(async () =>
      vi.mocked(ActionSheetIOS.showActionSheetWithOptions).mock.lastCall![1](1),
    );
    expect(labelled(renderer, 'Complete Call Sam')).toHaveLength(0);
    expect(server.state.taskStore.get(A)!.status).toBe('todo');
    releaseTaskWrites!();
    await settle();
    expect(server.state.taskStore.get(A)!.status).toBe('dropped');

    const relaunched = await launch();
    expect(banner(relaunched).props.accessibilityLabel).toBe(
      '0 still open, 0 coming up. Show list',
    );
  });

  it('puts each task in exactly one place', async () => {
    serve(
      [
        makeNote(TODAY_NOTE, `Plan\n{{task:${A}}}`, {
          type: 'daily',
          date: '2026-10-02',
          title: '',
        }),
      ],
      [
        makeTask(A, 'In the note'),
        makeTask(B, 'Still open one'),
        makeTask(C, 'Monday thing', { startDate: '2026-10-05' }),
      ],
    );
    const renderer = await launch();
    await openSheet(renderer);
    await act(async () => byLabel(renderer, 'Coming up · 1').props.onPress());
    // The Coming up tab shows C; switch back to count Still open.
    expect(labelled(renderer, 'Complete Monday thing')).toHaveLength(1);
    expect(labelled(renderer, 'Complete Still open one')).toHaveLength(0);
    await act(async () => byLabel(renderer, 'Still open · 1').props.onPress());

    expect(labelled(renderer, 'Complete In the note')).toHaveLength(1);
    expect(labelled(renderer, 'Complete Still open one')).toHaveLength(1);
    expect(labelled(renderer, 'Complete Monday thing')).toHaveLength(0);
  });

  it('adds a Still open task to today’s note with + Note', async () => {
    serve([yesterdaysNote], [yesterdaysTask]);
    const renderer = await launch();
    await openSheet(renderer);
    await act(async () =>
      byLabel(renderer, 'Add Call Sam to today’s note').props.onPress(),
    );
    await vi.waitFor(
      () =>
        expect(
          [...server.state.store.values()].find(
            (n) => n.type === 'daily' && n.date === '2026-10-02',
          )?.bodyMarkdown,
        ).toBe(`{{task:${A}}}\n\n`),
      { timeout: 3_000 },
    );
    expect(banner(renderer).props.accessibilityLabel).toBe(
      '0 still open, 0 coming up. Show list',
    );
  });

  it('moves between days and back to today', async () => {
    serve([yesterdaysNote], []);
    const renderer = await launch();
    await act(async () => byLabel(renderer, 'Previous day').props.onPress());
    await settle(10);
    expect(allText(renderer)).toContain('Thursday');
    expect(
      renderer.root.findAll(
        (node) =>
          (node.type as string) === 'TextInput' &&
          node.props.value === `{{task:${A}}}`,
      ),
    ).toHaveLength(0);
    expect(byLabel(renderer, 'Jump to today').props.disabled).toBe(false);
    await act(async () => byLabel(renderer, 'Jump to today').props.onPress());
    expect(allText(renderer)).toContain('Friday · Today');
  });

  it('when another device started the day first, keeps what was typed and merges it into their note', async () => {
    serve([], []);
    const renderer = await render(
      <Providers outbox>
        <TodayScreen />
      </Providers>,
    );
    mounted.push(renderer);
    await settle(15);
    // The other device creates today's note while this one shows the empty day.
    server.state.store.set(
      TODAY_NOTE,
      makeNote(TODAY_NOTE, 'From the laptop', {
        type: 'daily',
        date: '2026-10-02',
        title: '',
      }),
    );

    const body = () =>
      renderer.root.find(
        (node) =>
          (node.type as string) === 'TextInput' &&
          node.props.accessibilityLabel === 'Note body',
      );
    act(() => body().props.onChangeText('From the phone'));
    await vi.waitFor(
      () =>
        expect(allText(renderer)).toContain(
          'Another device started this daily note first',
        ),
      { timeout: 3_000 },
    );
    expect(allText(renderer)).toContain('From the laptop');
    expect(server.state.store.get(TODAY_NOTE)!.bodyMarkdown).toBe(
      'From the laptop',
    );
    expect(body().props.value).toBe('From the phone');

    await act(async () => byLabel(renderer, 'Merge').props.onPress());
    await vi.waitFor(() =>
      expect(server.state.store.get(TODAY_NOTE)!.bodyMarkdown).toBe(
        'From the laptop\n\nFrom the phone\n',
      ),
    );
    await settle(10);
    expect(allText(renderer)).not.toContain('Another device started');
    expect(body().props.value).toBe('From the laptop\n\nFrom the phone\n');
  });
});
