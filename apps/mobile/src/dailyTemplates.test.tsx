import { clearPendingFlushes } from '@gagnechris/app-core';
import { DAILY_TEMPLATE_TASK_MESSAGE } from '@gagnechris/shared';
import type { ReactElement } from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DailyTemplatesScreen from '../app/(tabs)/more/templates';
import TodayScreen from '../app/(tabs)/today/index';
import { databases } from '../test/expoSqlite';
import { notebookServer } from '../test/notebookServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { router } from '../test/router';
import { stopOutbox } from './outbox';

const WORK_TEMPLATE = '## Focus\n- \n';

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer[] = [];

const serve = () => {
  server = notebookServer([]);
  vi.stubGlobal('fetch', server.fetch);
};

const launch = async (screen: ReactElement) => {
  const renderer = await render(<Providers>{screen}</Providers>);
  mounted.push(renderer);
  await settle(15);
  return renderer;
};

const input = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'TextInput' &&
      node.props.accessibilityLabel === label,
  );

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
  serve();
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

describe('daily templates on iOS', () => {
  it('starts an empty day from its template without saving it', async () => {
    server.state.dailyTemplates.work = {
      bodyMarkdown: WORK_TEMPLATE,
      version: 1,
    };
    const renderer = await launch(<TodayScreen />);
    expect(input(renderer, 'Note body').props.value).toBe(WORK_TEMPLATE);
    expect(allText(renderer)).toContain(
      'Started from your Work template. It’s saved as soon as you type.',
    );
    expect(server.state.writes).toBe(0);

    await act(async () => byLabel(renderer, 'Edit template').props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/more/templates',
      params: { template: 'work' },
    });

    await act(async () => byLabel(renderer, 'Start blank').props.onPress());
    expect(input(renderer, 'Note body').props.value).toBe('');
    expect(allText(renderer)).not.toContain('Started from your');
    expect(server.state.writes).toBe(0);
  });

  it('saves checklists and never saves task lines', async () => {
    const renderer = await launch(<DailyTemplatesScreen />);
    const editor = () => input(renderer, 'Work template');
    expect(editor().props.value).toBe('');

    act(() => editor().props.onChangeText('[ ] call the bank'));
    expect(allText(renderer)).toContain(DAILY_TEMPLATE_TASK_MESSAGE);
    await settle(10);
    expect(server.state.writes).toBe(0);

    act(() => editor().props.onChangeText('- [ ] water plants'));
    expect(allText(renderer)).not.toContain(DAILY_TEMPLATE_TASK_MESSAGE);
    await vi.waitFor(
      () =>
        expect(server.state.dailyTemplates.work?.bodyMarkdown).toBe(
          '- [ ] water plants',
        ),
      { timeout: 3_000 },
    );
  });
});
