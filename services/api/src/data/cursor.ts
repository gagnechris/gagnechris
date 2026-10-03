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

export const PRIMARY_CURSOR_KEYS = ['pk', 'sk'] as const;

export const GSI1_CURSOR_KEYS = ['pk', 'sk', 'gsi1pk', 'gsi1sk'] as const;

export const GSI2_CURSOR_KEYS = ['pk', 'sk', 'gsi2pk', 'gsi2sk'] as const;

export const GSI3_CURSOR_KEYS = ['pk', 'sk', 'syncPk', 'syncSk'] as const;

export function assertCursorMatchesQuery(
  key: Record<string, unknown> | undefined,
  opts: {
    partitionAttr: string;
    partitionValue: string;
    sortAttr?: string;
    sortLowerBoundInclusive?: string;
    /** Stops a cursor from being replayed under a different query. */
    binding?: { attr: string; value: string };
  },
): void {
  if (!key) return;
  if (key[opts.partitionAttr] !== opts.partitionValue) {
    throw new SyntaxError('Invalid pagination cursor');
  }
  if (opts.binding && key[opts.binding.attr] !== opts.binding.value) {
    throw new SyntaxError('Invalid pagination cursor');
  }
  if (
    opts.sortAttr &&
    opts.sortLowerBoundInclusive !== undefined &&
    opts.sortLowerBoundInclusive !== ''
  ) {
    const sortValue = key[opts.sortAttr];
    if (
      typeof sortValue !== 'string' ||
      sortValue < opts.sortLowerBoundInclusive
    ) {
      throw new SyntaxError('Invalid pagination cursor');
    }
  }
}
