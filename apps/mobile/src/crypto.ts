type FillRandom = (array: Uint8Array) => Uint8Array;

type CryptoHost = { crypto?: { getRandomValues?: FillRandom } };

/** Hermes has no `crypto.getRandomValues`, which `createUlid` requires. */
export function installGetRandomValues(
  host: object,
  getRandomValues: FillRandom,
): void {
  const target = host as CryptoHost;
  if (typeof target.crypto?.getRandomValues === 'function') return;
  const existing = target.crypto ?? {};
  Object.defineProperty(host, 'crypto', {
    value: Object.assign(existing, { getRandomValues }),
    configurable: true,
    enumerable: false,
    writable: true,
  });
}
