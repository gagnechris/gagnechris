import { ActionSheetIOS, Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import NotesScreen from '../app/(tabs)/notes/index';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { router, searchParams } from '../test/router';

let server: ReturnType<typeof notebookServer>;

const serve = (...args: Parameters<typeof notebookServer>) => {
  server = notebookServer(...args);
  vi.stubGlobal('fetch', server.fetch);
};

beforeEach(() => {
  // Only the clock: timers stay real so requests and autosave run.
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const headings = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll(
      (node) =>
        (node.type as string) === 'Text' &&
        node.props.accessibilityRole === 'header',
    )
    .map((node) => node.props.children);

const rowLabels = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll(
      (node) =>
        (node.type as string) === 'Pressable' &&
        typeof node.props.accessibilityLabel === 'string' &&
        Array.isArray(node.props.accessibilityActions),
    )
    .map((node) => node.props.accessibilityLabel as string);

const listedNotes = (renderer: ReactTestRenderer) =>
  (
    renderer.root.find((node) => (node.type as string) === 'SectionList').props
      .sections as { data: { note: { title: string } }[] }[]
  ).flatMap((section) => section.data.map((item) => item.note.title));

const searchRequests = () =>
  server.state.requests.filter((r) => r === 'POST /api/notebook/search');

const renderNotes = async () => {
  const renderer = await render(
    <Providers>
      <NotesScreen />
    </Providers>,
  );
  await settle(10);
  return renderer;
};

describe('Notes list', () => {
  it('groups notes as the web list does, with excerpts, days and open counts', async () => {
    serve(
      [
        makeNote('01PINNED00000000000000000A', 'Pinned body', {
          title: 'Reading list',
          pinned: true,
          updatedAt: '2026-08-01T10:00:00.000Z',
        }),
        makeNote(
          '01DAILY000000000000000000A',
          '{{task:01HTASKAAAAAAAAAAAAAAAAAAA}}\n{{task:01HTASKBBBBBBBBBBBBBBBBBBB}}\nStandup notes',
          {
            type: 'daily',
            date: '2026-09-30',
            title: '',
          },
        ),
        makeNote('01OLD00000000000000000000A', '# Plan\nShip it', {
          title: 'Q3 plan',
          updatedAt: '2026-09-01T10:00:00.000Z',
        }),
        makeNote('01OTHER0000000000000000000', 'Personal stuff', {
          area: 'personal',
        }),
      ],
      [
        makeTask('01HTASKAAAAAAAAAAAAAAAAAAA', 'Call Bob'),
        makeTask('01HTASKBBBBBBBBBBBBBBBBBBB', 'Done', { status: 'done' }),
      ],
    );
    const renderer = await renderNotes();

    expect(headings(renderer)).toEqual(['PINNED', 'THIS WEEK', 'EARLIER']);
    expect(rowLabels(renderer)).toEqual([
      'Reading list, Pinned body, Aug 1',
      'Wednesday, Sep 30, Standup notes, Wed · 1 open',
      'Q3 plan, Plan, Sep 1',
    ]);
    expect(allText(renderer)).not.toContain('Personal stuff');
  });

  it('loads every page but mounts only a window of rows, and filters to daily notes or pages', async () => {
    serve(
      Array.from({ length: 120 }, (_, i) =>
        makeNote(`01PAGE${String(i).padStart(20, '0')}`, `body ${i}`, {
          title: `Page ${i}`,
          type: i % 2 ? 'daily' : 'page',
          date: i % 2 ? '2026-09-01' : null,
        }),
      ),
    );
    const renderer = await renderNotes();
    expect(listedNotes(renderer)).toHaveLength(120);
    expect(rowLabels(renderer)).toHaveLength(20);

    act(() => byLabel(renderer, 'Pages').props.onPress());
    await settle(10);
    expect(listedNotes(renderer)).toHaveLength(60);
    expect(
      listedNotes(renderer).every((t) => /^Page \d*[02468]$/.test(t)),
    ).toBe(true);
  });

  it('search asks the server once typing pauses, so it finds a note past the first page', async () => {
    serve(
      Array.from({ length: 60 }, (_, i) =>
        makeNote(`01SRCH${String(i).padStart(20, '0')}`, `text ${i}`, {
          title: i === 59 ? 'Quarterly offsite' : `Note ${i}`,
        }),
      ),
    );
    const renderer = await renderNotes();
    let typed = '';
    for (const letter of 'offsite') {
      typed += letter;
      act(() => byLabel(renderer, 'Search notes').props.onChangeText(typed));
    }
    await vi.waitFor(() => expect(searchRequests()).toHaveLength(1));
    await settle(10);
    expect(searchRequests()).toHaveLength(1);

    const hit = byLabel(renderer, 'Quarterly offsite, text 59');
    act(() => hit.props.onPress());
    expect(router.push).toHaveBeenCalledWith(
      '/notes/01SRCH00000000000000000059',
    );

    // The last results stay up while the next search waits on typing.
    act(() =>
      byLabel(renderer, 'Search notes').props.onChangeText('offsite plans'),
    );
    expect(byLabel(renderer, 'Quarterly offsite, text 59')).toBeTruthy();
    expect(allText(renderer)).not.toContain('Searching…');
    await vi.waitFor(() => expect(searchRequests()).toHaveLength(2));
  });

  it('opens a daily note on Today, from the list and from search', async () => {
    serve([
      makeNote('01DAILYOPEN000000000000000', 'Standup', {
        type: 'daily',
        date: '2026-09-30',
        title: '',
      }),
    ]);
    const renderer = await renderNotes();
    act(() =>
      byLabel(renderer, 'Wednesday, Sep 30, Standup, Wed').props.onPress(),
    );
    expect(router.navigate).toHaveBeenLastCalledWith(
      '/today?date=2026-09-30&area=work',
    );

    act(() => byLabel(renderer, 'Search notes').props.onChangeText('standup'));
    await vi.waitFor(() => expect(searchRequests()).toHaveLength(1));
    await settle(10);
    router.navigate.mockClear();
    const hit = byLabel(renderer, ', Standup');
    act(() => hit.props.onPress());
    expect(router.navigate).toHaveBeenCalledWith(
      '/today?date=2026-09-30&area=work',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('New page creates a page in the current area and opens it', async () => {
    serve([]);
    const renderer = await renderNotes();
    expect(allText(renderer)).toContain('No notes yet');

    await act(async () => byLabel(renderer, 'New page').props.onPress());
    await settle();
    const [created] = [...server.state.store.values()];
    expect(created).toMatchObject({ type: 'page', area: 'work' });
    expect(router.push).toHaveBeenCalledWith(`/notes/${created!.id}`);
  });

  it('pins and deletes from the row menu after a confirm', async () => {
    const id = '01ROW000000000000000000000';
    serve([makeNote(id, 'row body', { title: 'Row note' })]);
    const renderer = await renderNotes();

    const choose = async (option: string, confirm: string) => {
      act(() => byLabel(renderer, 'Actions for Row note').props.onPress());
      const [sheet, pick] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions)
        .mock.lastCall!;
      act(() => pick(sheet.options.indexOf(option)));
      const buttons = vi.mocked(Alert.alert).mock.lastCall![2]!;
      await act(async () =>
        buttons.find((b) => b.text === confirm)!.onPress!(),
      );
      await settle();
    };

    await choose('Pin', 'Pin');
    expect(server.state.store.get(id)!.pinned).toBe(true);
    expect(headings(renderer)).toEqual(['PINNED']);

    await choose('Delete', 'Delete');
    expect(server.state.store.get(id)!.deleted).toBe(true);
    expect(allText(renderer)).toContain('No notes yet');
  });

  it('offers the same actions to VoiceOver', async () => {
    serve([makeNote('01VO0000000000000000000000', 'b', { title: 'VO' })]);
    const renderer = await renderNotes();
    const row = renderer.root.find(
      (node) =>
        (node.type as string) === 'Pressable' &&
        Array.isArray(node.props.accessibilityActions),
    );
    expect(row.props.accessibilityActions).toEqual([
      { name: 'pin', label: 'Pin' },
      { name: 'delete', label: 'Delete' },
    ]);
    act(() =>
      row.props.onAccessibilityAction({ nativeEvent: { actionName: 'pin' } }),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Pin this note?',
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
  });
});

describe('Note screen', () => {
  it('a new page saves on its first edit', async () => {
    const id = '01NEW00000000000000000000A';
    serve([makeNote(id, '', { title: 'Untitled' })]);
    searchParams.current = { id };
    const renderer = await render(
      <Providers>
        <NoteScreen />
      </Providers>,
    );
    await settle(10);
    expect(allText(renderer)).toContain('Saved');

    act(() => byLabel(renderer, 'Note body').props.onChangeText('First line'));
    expect(allText(renderer)).toContain('Edited');
    await vi.waitFor(
      () => expect(server.state.store.get(id)!.bodyMarkdown).toBe('First line'),
      { timeout: 3_000 },
    );
    await settle();
    expect(allText(renderer)).toContain('Saved');
  });

  it('a daily note keeps its date title read-only', async () => {
    const id = '01DAY00000000000000000000A';
    serve([
      makeNote(id, 'x', { type: 'daily', date: '2026-10-01', title: '' }),
    ]);
    searchParams.current = { id };
    const renderer = await render(
      <Providers>
        <NoteScreen />
      </Providers>,
    );
    await settle(10);
    expect(byLabel(renderer, 'Title').props.editable).toBe(false);
  });
});
