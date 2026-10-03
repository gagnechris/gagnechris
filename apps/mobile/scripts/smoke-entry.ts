/**
 * A type-only `.d.ts` standing in for zod's runtime only fails when a schema is
 * evaluated, so this runs one. The iOS Metro react build does not export `act`,
 * so hook rendering is tested in `src/app-core.test.ts` instead.
 */
import { z } from 'zod';
import type { ApiClient } from '@gagnechris/api-client';
import { createVersionedResource } from '@gagnechris/app-core';
import {
  HealthResponseSchema,
  PostSchema,
  UlidSchema,
  createUlid,
  slugify,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';

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
  setCache: (qc, entity) => {
    qc.setQueryData(['smoke', 'note', entity.id], entity);
  },
});

if (typeof smokeResource.useQuery !== 'function') {
  throw new Error('createVersionedResource.useQuery missing from app-core');
}

void smokeResource
  .fetch({} as ApiClient, { id: 's1' })
  .then((note) => {
    if (note.body !== 'ok' || note.version !== 1) {
      throw new Error(
        'app-core versioned resource fetch returned unexpected data',
      );
    }
    console.log(
      'bundle smoke ok: zod v4 parsed, schema rejected, tokens numeric, app-core query',
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
