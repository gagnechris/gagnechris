/**
 * A type-only `.d.ts` standing in for zod's runtime only fails when a schema is
 * evaluated, so this runs one. It also renders an app-core hook, which throws
 * if Metro resolves a second React or react-query for the workspace packages.
 */
import { z } from 'zod';
import type { ApiClient } from '@gagnechris/api-client';
import { AppApiProvider, createVersionedResource } from '@gagnechris/app-core';
import {
  HealthResponseSchema,
  PostSchema,
  UlidSchema,
  createUlid,
  slugify,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { create } from 'react-test-renderer';
import { installGetRandomValues } from '../src/crypto';

// Zod 4 exposes top-level helpers like z.email; Zod 3 does not.
if (typeof z.email !== 'function') {
  throw new Error(
    'Expected zod v4 (z.email); Metro resolved an incompatible zod major',
  );
}

const health = HealthResponseSchema.parse({
  status: 'ok',
  service: 'gagnechris-api',
});
if (health.status !== 'ok') {
  throw new Error(`Unexpected health status: ${health.status}`);
}

const rejected = PostSchema.safeParse({ slug: '' });
if (rejected.success) {
  throw new Error('PostSchema accepted an empty post');
}

if (slugify('Hello There') !== 'hello-there') {
  throw new Error('slugify did not run');
}

if (typeof tokens.space[4] !== 'number') {
  throw new Error('space tokens must be px numbers for React Native');
}

const smokeUlid = createUlid();
if (UlidSchema.safeParse(smokeUlid).success !== true) {
  throw new Error(`createUlid produced invalid ULID: ${smokeUlid}`);
}

type SmokeNote = { id: string; body: string; version: number };

const smokeResource = createVersionedResource<SmokeNote, { id: string }>({
  queryKey: ({ id }) => ['smoke', 'note', id] as const,
  fetch: async () => ({ id: 's1', body: 'ok', version: 1 }),
  update: async (_c, _p, body) => ({
    id: 's1',
    body: String(body.body ?? ''),
    version: Number(body.version) + 1,
  }),
  tooLargeMessage: 'Too large.',
  setCache: (qc, entity) => {
    qc.setQueryData(['smoke', 'note', entity.id], entity);
  },
});

// Concurrent root and no `act` in the production build, so poll until the
// hook's query resolves.
async function renderQueryHook(): Promise<string | undefined> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let rendered: string | undefined;
  let renderError: unknown;
  // React only logs render errors; keep the cause (e.g. a second React copy's
  // null dispatcher) for the failure message.
  const Host = () => {
    try {
      rendered = smokeResource.useQuery({ id: 's1' }).data?.body;
    } catch (err) {
      renderError ??= err;
      throw err;
    }
    return null;
  };

  const root = create(
    createElement(AppApiProvider, {
      getClient: () => ({}) as ApiClient,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(Host),
      }),
    }),
  );
  for (
    let tick = 0;
    tick < 100 && rendered === undefined && renderError === undefined;
    tick += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  root.unmount();
  queryClient.clear();
  if (renderError !== undefined) throw renderError;
  return rendered;
}

// Hermes has no WebCrypto; the app's polyfill must reach the shared helper.
function ulidWithoutNativeCrypto(): string {
  const native = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  let filled = 0;
  try {
    installGetRandomValues(globalThis, (array) => {
      filled += 1;
      return array.fill(1);
    });
    const id = createUlid();
    if (filled !== 1) {
      throw new Error('createUlid did not use the installed getRandomValues');
    }
    return id;
  } finally {
    if (native) Object.defineProperty(globalThis, 'crypto', native);
  }
}

if (!UlidSchema.safeParse(ulidWithoutNativeCrypto()).success) {
  throw new Error('createUlid produced an invalid ULID through the polyfill');
}

void (async () => {
  const note = await smokeResource.fetch({} as ApiClient, { id: 's1' });
  if (note.body !== 'ok' || note.version !== 1) {
    throw new Error(
      'app-core versioned resource fetch returned unexpected data',
    );
  }
  const rendered = await renderQueryHook();
  if (rendered !== 'ok') {
    throw new Error(
      `app-core useQuery rendered ${String(rendered)}, expected the fetched note`,
    );
  }
  console.log(
    'bundle smoke ok: zod v4 parsed, schema rejected, tokens numeric, ulid polyfilled, app-core hook rendered',
  );
})().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
