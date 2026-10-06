import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import type { VersionedResource } from '../src/query/createVersionedResource.js';
import { homeResource } from '../src/query/home.js';
import { noteResource } from '../src/query/notes.js';
import { postResource } from '../src/query/posts.js';
import { projectResource } from '../src/query/projects.js';
import { resumeResource } from '../src/query/resume.js';
import { taskResource } from '../src/query/tasks.js';
import {
  NOTEBOOK_TOO_LARGE_MESSAGE,
  siteTooLargeMessage,
} from '../src/query/tooLarge.js';
import { useVersionedDocEditor } from '../src/useVersionedDocEditor.js';
import { act, renderHook } from './renderHook.js';

type Entity = { id: string; version: number };

const waitUntil = async (predicate: () => boolean, label: string) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Timed out waiting for ${label}`);
};

/** Serves one entity on GET and answers every PUT with a 413. */
const tooLargeClient = (): ApiClient => {
  const entity = {
    id: 'e1',
    version: 1,
    status: 'draft',
    hasUnpublishedChanges: false,
  };
  return {
    GET: async () => ({ data: entity, response: { status: 200 } }),
    PUT: async () => ({
      error: { error: 'payload_too_large' },
      response: { status: 413 },
    }),
  } as unknown as ApiClient;
};

const saveErrorOn413 = async (
  resource: VersionedResource<Entity, { id: string }>,
): Promise<string | null> => {
  const client = tooLargeClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
        resource,
        params: { id: 'e1' },
        initialDraft: { body: '' },
        toDraft: () => ({ body: '' }),
        getEntityId: (entity) => entity.id,
        toPayload: (draft) => ({ body: draft.body }),
        conflictMessage: 'Conflict',
        confirm: async () => true,
      }),
    { wrapper },
  );
  await waitUntil(() => !result.current.isLoading, 'hydrate');
  act(() => {
    result.current.updateDraft(() => ({ body: 'x'.repeat(10) }));
  });
  await act(async () => {
    expect(await result.current.save()).toBe('error');
  });
  return result.current.saveError;
};

const asResource = (resource: unknown) =>
  resource as VersionedResource<Entity, { id: string }>;

describe('413 save error', () => {
  test.each([
    ['post', postResource, 'this post'],
    ['project', projectResource, 'this project'],
    ['home', homeResource, 'the home page'],
    ['resume', resumeResource, 'the resume'],
  ])(
    'a %s states its own limit, not the Notebook limits',
    async (_name, resource, subject) => {
      const message = await saveErrorOn413(asResource(resource));
      expect(message).toBe(siteTooLargeMessage(subject));
      expect(message).not.toMatch(/notes|tags/);
    },
  );

  test.each([
    ['note', noteResource],
    ['task', taskResource],
  ])('a %s states the Notebook limits', async (_name, resource) => {
    expect(await saveErrorOn413(asResource(resource))).toBe(
      NOTEBOOK_TOO_LARGE_MESSAGE,
    );
  });
});
