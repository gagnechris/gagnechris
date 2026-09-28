/**
 * Opaque pagination cursor helpers (CHR-129).
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

export function decodeCursor(
  cursor: string | undefined,
): Record<string, unknown> | undefined {
  if (!cursor?.trim()) return undefined;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new SyntaxError('Invalid pagination cursor');
  }
}
