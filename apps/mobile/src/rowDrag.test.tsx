import {
  AUTOSAVE_DEBOUNCE_MS,
  clearPendingFlushes,
} from '@gagnechris/app-core';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { Providers, render, settle } from '../test/render';
import { searchParams } from '../test/router';

const NOTE = '01NOTE0000000000000000000A';
const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
const B = '01HTASKBBBBBBBBBBBBBBBBBBB';
const C = '01HTASKCCCCCCCCCCCCCCCCCCC';
const ROW = 44;

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
  searchParams.current = { id: NOTE };
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  clearPendingFlushes();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const renderNote = async (
  body: string,
  options?: Parameters<typeof render>[1],
) => {
  server = notebookServer(
    [makeNote(NOTE, body)],
    [makeTask(A, 'Alpha'), makeTask(B, 'Bravo'), makeTask(C, 'Charlie')],
  );
  vi.stubGlobal('fetch', server.fetch);
  const renderer = await render(
    <Providers>
      <NoteScreen />
    </Providers>,
    options,
  );
  mounted = renderer;
  await settle(10);
  // Rows stacked one under the other, as laid out on a phone.
  const rows = renderer.root.findAll(
    (node) =>
      (node.type as string) === 'Animated.View' &&
      typeof node.props.onLayout === 'function',
  );
  act(() =>
    rows.forEach((row, i) =>
      row.props.onLayout({
        nativeEvent: { layout: { x: 0, y: i * ROW, width: 320, height: ROW } },
      }),
    ),
  );
  return renderer;
};

/** The grip of the row with `title`; the PanResponder mock puts its handlers on it. */
const grip = (renderer: ReactTestRenderer, title: string) => {
  const row = renderer.root.find(
    (node) =>
      (node.type as string) === 'Animated.View' &&
      node.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityLabel === `Open task ${title}`,
      ).length > 0 &&
      typeof node.props.onLayout === 'function',
  );
  return row.find(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.onPanResponderGrant === 'function',
  ).props;
};

const dragBy = (
  renderer: ReactTestRenderer,
  title: string,
  dx: number,
  dy: number,
) => {
  const handlers = grip(renderer, title);
  act(() => handlers.onPanResponderGrant());
  act(() => handlers.onPanResponderMove({}, { dx, dy, moveY: 300 + dy }));
  act(() => handlers.onPanResponderRelease({}, { dx, dy, moveY: 300 + dy }));
};

const saved = () => server.state.store.get(NOTE)!.bodyMarkdown;

describe('dragging task rows', () => {
  it('moves a task with its lines to where it is dropped', async () => {
    const renderer = await renderNote(
      `{{task:${A}}}\n  why\n{{task:${B}}}\n{{task:${C}}}`,
    );
    dragBy(renderer, 'Alpha', 0, ROW * 1.6);
    await vi.waitFor(
      () =>
        expect(saved()).toBe(
          `{{task:${B}}}\n{{task:${A}}}\n  why\n{{task:${C}}}`,
        ),
      { timeout: 3_000 },
    );
  });

  it('moves a task to the end, below the last row', async () => {
    const renderer = await renderNote(
      `{{task:${A}}}\n{{task:${B}}}\n{{task:${C}}}`,
    );
    dragBy(renderer, 'Alpha', 0, ROW * 3);
    await vi.waitFor(
      () => expect(saved()).toBe(`{{task:${B}}}\n{{task:${C}}}\n{{task:${A}}}`),
      { timeout: 3_000 },
    );
  });

  it('nests a task under the one above when dragged right, and back out when dragged left', async () => {
    const renderer = await renderNote(
      `{{task:${A}}}\n{{task:${B}}}\n{{task:${C}}}`,
    );
    dragBy(renderer, 'Charlie', 40, 0);
    await vi.waitFor(
      () =>
        expect(saved()).toBe(`{{task:${A}}}\n{{task:${B}}}\n  {{task:${C}}}`),
      { timeout: 3_000 },
    );
    dragBy(renderer, 'Charlie', -40, 0);
    await vi.waitFor(
      () => expect(saved()).toBe(`{{task:${A}}}\n{{task:${B}}}\n{{task:${C}}}`),
      { timeout: 3_000 },
    );
  });

  it('nests a task dragged right in place, without moving it past the heading below', async () => {
    const renderer = await renderNote(
      `{{task:${A}}}\n{{task:${B}}}\n## Later\n{{task:${C}}}`,
    );
    dragBy(renderer, 'Bravo', 40, 4);
    await vi.waitFor(
      () =>
        expect(saved()).toBe(
          `{{task:${A}}}\n  {{task:${B}}}\n## Later\n{{task:${C}}}`,
        ),
      { timeout: 3_000 },
    );
  });

  it('drops where the row is after the list scrolls under a finger held at the edge', async () => {
    const scrollTo = vi.fn();
    const renderer = await renderNote(
      `{{task:${A}}}\n{{task:${B}}}\n{{task:${C}}}`,
      {
        createNodeMock: (element) =>
          element.type === 'ScrollView'
            ? {
                scrollTo,
                measureInWindow: (
                  done: (x: number, y: number, w: number, h: number) => void,
                ) => done(0, 0, 320, 600),
              }
            : null,
      },
    );
    const scrollView = renderer.root.find(
      (node) => (node.type as string) === 'ScrollView',
    );
    act(() => scrollView.props.onLayout());
    const handlers = grip(renderer, 'Alpha');
    const atEdge = { dx: 0, dy: 4, moveY: 590 };
    act(() => handlers.onPanResponderGrant());
    act(() => handlers.onPanResponderMove({}, atEdge));
    await vi.waitFor(
      () => expect(scrollTo.mock.lastCall?.[0].y).toBeGreaterThan(ROW * 3),
      { timeout: 3_000 },
    );
    act(() => handlers.onPanResponderRelease({}, atEdge));
    await vi.waitFor(
      () => expect(saved()).toBe(`{{task:${B}}}\n{{task:${C}}}\n{{task:${A}}}`),
      { timeout: 3_000 },
    );
  });

  it('leaves the note alone when a row is dropped where it was', async () => {
    const renderer = await renderNote(`{{task:${A}}}\n{{task:${B}}}`);
    dragBy(renderer, 'Alpha', 0, 4);
    await act(
      () => new Promise((done) => setTimeout(done, AUTOSAVE_DEBOUNCE_MS * 2)),
    );
    await settle(10);
    expect(saved()).toBe(`{{task:${A}}}\n{{task:${B}}}`);
  });
});
