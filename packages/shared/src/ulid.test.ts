import { describe, expect, it } from 'vitest';
import { UlidSchema } from './schemas.js';
import { createUlid } from './ulid.js';

describe('createUlid (CHR-177)', () => {
  it('produces a valid UlidSchema value from fixed entropy', () => {
    const fixed = new Uint8Array(10).fill(0);
    const id = createUlid(() => fixed, 0);
    expect(id).toHaveLength(26);
    expect(UlidSchema.parse(id)).toBe(id);
    expect(id).toBe('00000000000000000000000000');
  });

  it('encodes the timestamp in the first 10 characters', () => {
    const fixed = new Uint8Array(10).fill(1);
    const a = createUlid(() => fixed, 1);
    const b = createUlid(() => fixed, 2);
    expect(a.slice(0, 10)).not.toBe(b.slice(0, 10));
    expect(a.slice(10)).toBe(b.slice(10));
  });

  it('rejects random() that does not return 10 bytes', () => {
    expect(() => createUlid(() => new Uint8Array(9))).toThrow(/10 bytes/);
  });
});
