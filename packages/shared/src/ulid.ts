/**
 * Crockford Base32 ULID (26 chars). Injectable entropy for Node / browsers /
 * Hermes (`crypto.getRandomValues`, or expo-crypto polyfill) — CHR-177.
 *
 * No BigInt — keeps the helper safe on older Hermes builds.
 */
import { UlidSchema } from './schemas.js';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type RandomBytes = (size: number) => Uint8Array;

type SubtleCryptoLike = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

function defaultRandom(size: number): Uint8Array {
  const out = new Uint8Array(size);
  const cryptoObj = (globalThis as { crypto?: SubtleCryptoLike }).crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error(
      'createUlid requires crypto.getRandomValues (polyfill with expo-crypto on Hermes)',
    );
  }
  cryptoObj.getRandomValues(out);
  return out;
}

function encodeTime(ms: number): string {
  let t = Math.floor(ms);
  if (!Number.isFinite(t) || t < 0 || t > 0xffff_ffff_ffff) {
    throw new RangeError('ULID timestamp out of range');
  }
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    const mod = t % 32;
    out = ENCODING[mod]! + out;
    t = Math.floor(t / 32);
  }
  return out;
}

/** Encode 10 random bytes (80 bits) as 16 Crockford chars. */
function encodeRandom(bytes: Uint8Array): string {
  const chars: string[] = new Array(16);
  // Bit buffer: pull 5 bits at a time from the 80-bit stream (MSB first).
  let bitPos = 0;
  for (let i = 0; i < 16; i += 1) {
    const byteIndex = Math.floor(bitPos / 8);
    const bitOffset = bitPos % 8;
    let bits: number;
    if (bitOffset <= 3) {
      bits = (bytes[byteIndex]! >> (3 - bitOffset)) & 0x1f;
    } else {
      const hi = (bytes[byteIndex]! << (bitOffset - 3)) & 0x1f;
      const lo = bytes[byteIndex + 1]! >> (11 - bitOffset);
      bits = (hi | lo) & 0x1f;
    }
    chars[i] = ENCODING[bits]!;
    bitPos += 5;
  }
  return chars.join('');
}

/**
 * Generate a ULID. Pass `random` in tests; production uses
 * `crypto.getRandomValues` (10 bytes of entropy).
 */
export function createUlid(
  random: RandomBytes = defaultRandom,
  nowMs: number = Date.now(),
): string {
  const entropy = random(10);
  if (entropy.byteLength !== 10) {
    throw new Error('createUlid random() must return exactly 10 bytes');
  }
  const id = encodeTime(nowMs) + encodeRandom(entropy);
  return UlidSchema.parse(id);
}
