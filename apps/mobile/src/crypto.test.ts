import { UlidSchema } from '@gagnechris/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installGetRandomValues } from './crypto';
import { createUlid } from './ulid';

const { fakeFill, loadOrder } = vi.hoisted(() => ({
  fakeFill: vi.fn((array: Uint8Array) => {
    array.fill(7);
    return array;
  }),
  loadOrder: [] as string[],
}));

vi.mock('expo-crypto', () => ({ getRandomValues: fakeFill }));
vi.mock('expo-router/entry', () => {
  loadOrder.push('expo-router/entry');
  return {};
});

describe('getRandomValues polyfill', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    fakeFill.mockClear();
    loadOrder.length = 0;
  });

  it('lets createUlid run on a runtime with no crypto (Hermes)', async () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => createUlid()).toThrow(/crypto.getRandomValues/);

    await import('./polyfills');

    expect(UlidSchema.safeParse(createUlid()).success).toBe(true);
    expect(fakeFill).toHaveBeenCalledOnce();
  });

  it('is installed before expo-router loads any route', async () => {
    vi.stubGlobal('crypto', undefined);
    vi.doMock('./polyfills', async (importOriginal) => {
      const mod = await importOriginal();
      loadOrder.push(
        typeof globalThis.crypto?.getRandomValues === 'function'
          ? 'polyfills (installed)'
          : 'polyfills (missing)',
      );
      return mod;
    });

    await import('../index');

    expect(loadOrder).toEqual(['polyfills (installed)', 'expo-router/entry']);
  });

  it('adds getRandomValues to an existing crypto object', () => {
    const host: { crypto?: object } = { crypto: { randomUUID: () => 'x' } };
    installGetRandomValues(host, fakeFill);
    expect(host.crypto).toMatchObject({
      randomUUID: expect.any(Function),
      getRandomValues: fakeFill,
    });
  });

  it('keeps a native getRandomValues', () => {
    const native = (array: Uint8Array) => array;
    const host = { crypto: { getRandomValues: native } };
    installGetRandomValues(host, fakeFill);
    expect(host.crypto.getRandomValues).toBe(native);
  });
});
