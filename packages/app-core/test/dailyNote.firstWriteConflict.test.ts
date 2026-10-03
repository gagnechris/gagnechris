import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { dailyNoteResource } from '../src/query/notes.js';
import { useVersionedDocEditor } from '../src/useVersionedDocEditor.js';
import { act, renderHook } from './renderHook.js';

type NoteDraft = {
  title: string;
  bodyMarkdown: string;
  tags: string[];
  pinned: boolean;
};

type StoredNote = {
  id: string;
  userId: string;
  area: 'work';
  type: 'daily';
  date: string;
  title: string;
  bodyMarkdown: string;
  tags: string[];
  pinned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

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

describe('daily note first write without a false conflict', () => {
  test('typing during first upsert does not surface remote conflict', async () => {
    // Object bag so nested mock assignments stay visible to tsc (let+closure → never).
    const state: { note: StoredNote | null; saveCalls: number } = {
      note: null,
      saveCalls: 0,
    };

    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });

    const client = {
      GET: vi.fn(async (path: string) => {
        if (path === '/api/notebook/notes/daily/{area}/{date}') {
          if (!state.note) {
            return {
              data: {
                exists: false as const,
                userId: 'u1',
                area: 'work' as const,
                type: 'daily' as const,
                date: '2026-10-03',
                title: '',
                bodyMarkdown: '',
                tags: [],
                pinned: false as const,
                version: 0 as const,
              },
              error: undefined,
              response: { status: 200 },
            };
          }
          return {
            data: state.note,
            error: undefined,
            response: { status: 200 },
          };
        }
        return {
          data: { items: state.note ? [state.note] : [] },
          error: undefined,
          response: { status: 200 },
        };
      }),
      PUT: vi.fn(
        async (_path: string, init?: { body?: Record<string, unknown> }) => {
          state.saveCalls += 1;
          const body = init?.body ?? {};
          // Hold the first save so we can type mid-flight (bumpEdit clears 'saving').
          if (state.saveCalls === 1) {
            await saveGate;
          }
          const now = new Date().toISOString();
          const prev = state.note;
          if (
            prev &&
            body.version !== undefined &&
            body.version !== prev.version
          ) {
            return {
              data: undefined,
              error: { error: 'version_conflict', message: 'Conflict' },
              response: { status: 409 },
            };
          }
          state.note = {
            id: String(body.id ?? prev?.id ?? '01TESTFIRSTWRITE00000000001'),
            userId: 'u1',
            area: 'work',
            type: 'daily',
            date: '2026-10-03',
            title: String(body.title ?? prev?.title ?? ''),
            bodyMarkdown: String(body.bodyMarkdown ?? prev?.bodyMarkdown ?? ''),
            tags: Array.isArray(body.tags)
              ? (body.tags as string[])
              : (prev?.tags ?? []),
            pinned: Boolean(body.pinned ?? prev?.pinned ?? false),
            version: (prev?.version ?? 0) + 1,
            createdAt: prev?.createdAt ?? now,
            updatedAt: now,
            deleted: false,
          };
          return {
            data: state.note,
            error: undefined,
            response: { status: 200 },
          };
        },
      ),
    } as unknown as ApiClient;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The Today page caches a Set under notes keys; setCachedNote must not treat
    // it as infinite list pages.
    queryClient.setQueryData(
      [
        'admin',
        'notebook',
        'notes',
        'daily-dates',
        'work',
        '2026-10-01',
        '2026-10-31',
      ],
      new Set<string>(),
    );

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
          params: { area: 'work' as const, date: '2026-10-03' },
          initialDraft: {
            title: '',
            bodyMarkdown: '',
            tags: [],
            pinned: false,
          } satisfies NoteDraft,
          toDraft: (n) => ({
            title: n.title,
            bodyMarkdown: n.bodyMarkdown,
            tags: n.tags,
            pinned: n.pinned,
          }),
          getEntityId: (n) => `${n.area}:${n.date}:${n.id}`,
          toPayload: (current, note) => ({
            id: note.id,
            title: current.title,
            bodyMarkdown: current.bodyMarkdown,
            tags: current.tags,
            pinned: current.pinned,
          }),
          conflictMessage:
            'Conflict — another device updated this daily note. Reload and try again.',
          confirm: async () => true,
        }),
      { wrapper },
    );

    await waitUntil(() => !result.current.isLoading, 'hydrate empty daily');
    expect(result.current.entity?.version).toBe(0);

    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        bodyMarkdown: 'first',
      }));
    });

    let savePromise!: Promise<string>;
    act(() => {
      savePromise = result.current.save();
    });

    await waitUntil(
      () => result.current.saveState === 'saving' || state.saveCalls === 1,
      'save in flight',
    );

    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        bodyMarkdown: 'first more',
      }));
    });

    expect(result.current.dirty).toBe(true);

    await act(async () => {
      releaseSave();
      await savePromise;
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitUntil(
      () =>
        state.note?.bodyMarkdown === 'first more' &&
        result.current.saveError === null &&
        !result.current.dirty,
      'second save clean',
    );

    expect(result.current.saveError).toBeNull();
    expect(result.current.entity?.version).toBeGreaterThan(0);
    expect(state.note?.version).toBeGreaterThan(0);
  });
});
