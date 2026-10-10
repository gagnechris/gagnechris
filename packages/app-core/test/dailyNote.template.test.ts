import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import type { Note } from '../src/query/api.js';
import {
  dailyNoteResource,
  isTemplateStartedDaily,
  startDailyNoteBlank,
} from '../src/query/notes.js';
import { useVersionedDocEditor } from '../src/useVersionedDocEditor.js';
import { act, renderHook } from './renderHook.js';

const DATE = '2026-10-16';
const TEMPLATE = '## Focus for Friday\n- \n';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const waitUntil = async (predicate: () => boolean, label: string) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
};

function setup() {
  const puts: Record<string, unknown>[] = [];
  const client = {
    GET: vi.fn(async () => ({
      data: {
        exists: false as const,
        userId: 'u1',
        area: 'work' as const,
        type: 'daily' as const,
        date: DATE,
        title: '',
        bodyMarkdown: '',
        tags: [],
        pinned: false as const,
        version: 0 as const,
        templateMarkdown: TEMPLATE,
      },
      error: undefined,
      response: { status: 200 },
    })),
    PUT: vi.fn(
      async (_path: string, init?: { body?: Record<string, unknown> }) => {
        const body = init?.body ?? {};
        puts.push(body);
        const now = new Date().toISOString();
        return {
          data: {
            id: String(body.id),
            userId: 'u1',
            area: 'work',
            type: 'daily',
            date: DATE,
            title: '',
            bodyMarkdown: String(body.bodyMarkdown ?? ''),
            tags: [],
            pinned: false,
            taskIds: [],
            version: 1,
            createdAt: now,
            updatedAt: now,
            deleted: false,
          },
          error: undefined,
          response: { status: 200 },
        };
      },
    ),
  } as unknown as ApiClient;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const datesKey = [
    'admin',
    'notebook',
    'notes',
    'daily-dates',
    'work',
    '2026-10-01',
    '2026-10-31',
  ];
  queryClient.setQueryData(datesKey, new Set<string>());
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children,
      }),
    });
  const { result } = renderHook(
    () =>
      useVersionedDocEditor({
        resource: dailyNoteResource,
        params: { area: 'work' as const, date: DATE },
        initialDraft: { bodyMarkdown: '' },
        toDraft: (n: Note) => ({ bodyMarkdown: n.bodyMarkdown }),
        getEntityId: (n) => `${n.area}:${n.date}:${n.id}`,
        toPayload: (current, note) => ({
          id: note.id,
          bodyMarkdown: current.bodyMarkdown,
        }),
        conflictMessage: 'Conflict',
        confirm: async () => true,
      }),
    { wrapper },
  );
  const dates = () => queryClient.getQueryData<Set<string>>(datesKey);
  return { result, puts, dates, client };
}

describe('a day started from its template', () => {
  test('shows the template as clean text and saves it with the first edit', async () => {
    const { result, puts, dates } = setup();
    await waitUntil(() => !result.current.isLoading, 'hydrate');
    expect(result.current.draft.bodyMarkdown).toBe(TEMPLATE);
    expect(result.current.dirty).toBe(false);
    expect(isTemplateStartedDaily(result.current.entity!)).toBe(true);
    expect(puts).toHaveLength(0);
    expect(dates()?.size).toBe(0);

    act(() => {
      result.current.updateDraft((prev) => ({
        bodyMarkdown: `${prev.bodyMarkdown}Ship it`,
      }));
    });
    await act(async () => {
      await result.current.save();
    });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.bodyMarkdown).toBe(`${TEMPLATE}Ship it`);
    expect(dates()?.has(DATE)).toBe(true);
  });

  test('Start blank empties the day without saving, and stays blank on refetch', async () => {
    const { result, puts, dates, client } = setup();
    await waitUntil(() => !result.current.isLoading, 'hydrate');
    act(() => {
      result.current.replaceFromEntity(
        startDailyNoteBlank(result.current.entity!),
      );
    });
    expect(result.current.draft.bodyMarkdown).toBe('');
    expect(result.current.dirty).toBe(false);
    expect(puts).toHaveLength(0);
    expect(dates()?.size).toBe(0);

    const refetched = await dailyNoteResource.fetch(client, {
      area: 'work',
      date: DATE,
    });
    expect(refetched.bodyMarkdown).toBe('');
  });
});
