import type { SaveState } from '@gagnechris/app-core';
import { useState } from 'react';
import { AppState, Text } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allText, byLabel, render } from '../test/render';
import { router, searchParams } from '../test/router';
import type { AfterConflict } from './notebook/ConflictPanel';
import {
  DetailEditorShell,
  detailEditorRoute,
  RemountOnResolve,
  useDetailEditor,
  type DetailEditorState,
  type DetailScreenProps,
} from './notebook/DetailEditorShell';

vi.mock('./notebook/ConflictPanel', async () => {
  const { createElement } = await import('react');
  return {
    ConflictPanel: (props: object) => createElement('ConflictPanel', props),
  };
});

type Entity = { id: string; title: string };

const editorState = (
  over: Partial<DetailEditorState<Entity>> = {},
): DetailEditorState<Entity> => ({
  entity: { id: 'n1', title: 'Plans' },
  isLoading: false,
  loadError: null,
  saveError: null,
  dirty: false,
  saveState: 'idle' as SaveState,
  save: vi.fn(),
  ...over,
});

let mounted: ReactTestRenderer | null = null;
let mounts = 0;

beforeEach(() => {
  mounts = 0;
  searchParams.current = { id: 'n1' };
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  vi.clearAllMocks();
});

const conflictPanel = (renderer: ReactTestRenderer) =>
  renderer.root.find((node) => (node.type as string) === 'ConflictPanel');

const resolve = (renderer: ReactTestRenderer, after: AfterConflict) =>
  act(() =>
    (conflictPanel(renderer).props.onResolved as (a: AfterConflict) => void)(
      after,
    ),
  );

/** Counts its mounts, so a test can tell a remount from a re-render. */
const Counter = () => {
  const [mount] = useState(() => (mounts += 1));
  return <Text>{`mount ${mount}`}</Text>;
};

const Screen = ({
  id,
  onReload,
  editor = editorState(),
}: DetailScreenProps & { editor?: DetailEditorState<Entity> }) => (
  <DetailEditorShell
    editor={editor}
    conflictId={id}
    onReload={onReload}
    openPath={(next) => `/notes/${next}`}
    loadingText="Loading note…"
    menuLabel="Note actions"
    onMenu={() => undefined}
    backgroundColor="white"
    contentStyle={{}}
  >
    {(entity) => (
      <>
        <Text>{entity.title}</Text>
        <Counter />
      </>
    )}
  </DetailEditorShell>
);

const Route = detailEditorRoute(Screen);

const open = async (element: React.JSX.Element) => {
  mounted = await render(element);
  return mounted;
};

describe('DetailEditorShell', () => {
  it('opens a new copy in place and closes the screen as the conflict says', async () => {
    const renderer = await open(<Route />);
    expect(conflictPanel(renderer).props.entityId).toBe('n1');

    resolve(renderer, { type: 'open', id: 'n2' });
    expect(router.replace).toHaveBeenCalledWith('/notes/n2');

    resolve(renderer, { type: 'close' });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(allText(renderer)).toContain('mount 1');
  });

  it('remounts the editor after a choice that keeps the screen', async () => {
    const renderer = await open(<Route />);
    expect(allText(renderer)).toContain('mount 1');

    resolve(renderer, { type: 'reload' });
    expect(allText(renderer)).toContain('mount 2');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows the conflict over a load error, without the header', async () => {
    const renderer = await open(
      <Screen
        id="n1"
        onReload={() => undefined}
        editor={editorState({ entity: null, loadError: 'Not found' })}
      />,
    );
    expect(conflictPanel(renderer)).toBeTruthy();
    expect(allText(renderer)).toContain('Not found');
    expect(
      renderer.root.findAll((node) => (node.type as string) === 'Header'),
    ).toHaveLength(0);
  });

  it('shows the save state and keeps ⋯ off until the entity loads', async () => {
    const renderer = await open(
      <Screen
        id="n1"
        onReload={() => undefined}
        editor={editorState({ entity: null, isLoading: true, dirty: true })}
      />,
    );
    expect(allText(renderer)).toContain('Loading note…');
    expect(allText(renderer)).toContain('Edited');
    expect(byLabel(renderer, 'Note actions').props.disabled).toBe(true);

    await act(async () =>
      renderer.update(
        <Screen
          id="n1"
          onReload={() => undefined}
          editor={editorState({ saveError: 'Too large' })}
        />,
      ),
    );
    expect(allText(renderer)).toContain('Plans');
    expect(allText(renderer)).toContain('Saved');
    expect(allText(renderer)).toContain('Too large');
    expect(byLabel(renderer, 'Note actions').props.disabled).toBe(false);
  });

  it('saves an edited draft when the app leaves the foreground', async () => {
    const save = vi.fn();
    await open(
      <Screen
        id="n1"
        onReload={() => undefined}
        editor={editorState({ dirty: true, save })}
      />,
    );
    const listener = vi.mocked(AppState.addEventListener).mock.lastCall![1];
    act(() => listener('background'));
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('useDetailEditor without openPath', () => {
  const Inline = ({ onReload }: { onReload: () => void }) => {
    const { conflict, saveLabel } = useDetailEditor({
      editor: editorState(),
      conflictId: 'd1',
      onReload,
    });
    return (
      <>
        <Text>{saveLabel}</Text>
        {conflict}
      </>
    );
  };

  it('reloads for every choice', async () => {
    const onReload = vi.fn();
    const renderer = await open(<Inline onReload={onReload} />);
    resolve(renderer, { type: 'open', id: 'd2' });
    resolve(renderer, { type: 'close' });
    resolve(renderer, { type: 'reload' });
    expect(onReload).toHaveBeenCalledTimes(3);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(allText(renderer)).toContain('Saved');
  });
});

describe('RemountOnResolve', () => {
  it('remounts when the key changes and on reload', async () => {
    let reload = () => undefined as void;
    const tree = (resetKey: string) => (
      <RemountOnResolve resetKey={resetKey}>
        {(onReload) => {
          reload = onReload;
          return <Counter />;
        }}
      </RemountOnResolve>
    );
    const renderer = await open(tree('a'));
    expect(allText(renderer)).toBe('mount 1');

    act(() => renderer.update(tree('a')));
    expect(allText(renderer)).toBe('mount 1');

    act(() => renderer.update(tree('b')));
    expect(allText(renderer)).toBe('mount 2');

    act(() => reload());
    expect(allText(renderer)).toBe('mount 3');
  });
});
