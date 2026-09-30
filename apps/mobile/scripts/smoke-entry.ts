/**
 * Entry for `bundle-smoke.mjs`: exercises the shared Zod runtime through the
 * real Metro resolver. Bundling alone proved nothing in CHR-142 — the crash was
 * a type-only `.d.ts` standing in for `zod`'s runtime, which only shows up when
 * a schema is actually evaluated (CHR-150).
 */
import { HealthResponseSchema, PostSchema, slugify } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';

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

console.log('bundle smoke ok: zod parsed, schema rejected, tokens numeric');
