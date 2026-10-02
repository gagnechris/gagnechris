/**
 * Opaque pagination cursor helpers (CHR-129 / CHR-152 / CHR-160).
 * Cursor is base64url(JSON of DynamoDB LastEvaluatedKey).
 */

export function encodeCursor(
  lastEvaluatedKey: Record<string, unknown> | undefined,
): string | undefined {
  if (!lastEvaluatedKey || Object.keys(lastEvaluatedKey).length === 0) {
    return undefined;
  }
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString(
    'base64url',
  );
}

/**
 * Decode an opaque cursor. When `requiredKeys` is set, the key set must match
 * exactly and every value must be a string. Throws SyntaxError → HTTP 400.
 */
export function decodeCursor(
  cursor: string | undefined,
  requiredKeys?: readonly string[],
): Record<string, unknown> | undefined {
  if (!cursor?.trim()) return undefined;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid');
    }
    const key = parsed as Record<string, unknown>;
    if (requiredKeys && requiredKeys.length > 0) {
      const names = Object.keys(key);
      if (names.length !== requiredKeys.length) {
        throw new Error('key set mismatch');
      }
      for (const name of requiredKeys) {
        if (!(name in key) || typeof key[name] !== 'string') {
          throw new Error(`invalid key ${name}`);
        }
      }
    }
    return key;
  } catch {
    throw new SyntaxError('Invalid pagination cursor');
  }
}

/** Primary-table ExclusiveStartKey shape. */
export const PRIMARY_CURSOR_KEYS = ['pk', 'sk'] as const;

/** GSI1 ExclusiveStartKey shape (base table keys + index keys). */
export const GSI1_CURSOR_KEYS = ['pk', 'sk', 'gsi1pk', 'gsi1sk'] as const;

/** GSI2 ExclusiveStartKey shape (base table keys + index keys). */
export const GSI2_CURSOR_KEYS = ['pk', 'sk', 'gsi2pk', 'gsi2sk'] as const;

/** GSI3 ExclusiveStartKey shape (sync feed). */
export const GSI3_CURSOR_KEYS = ['pk', 'sk', 'syncPk', 'syncSk'] as const;
