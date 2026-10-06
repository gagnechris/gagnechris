import { PAGE_BYTE_BUDGET, jsonByteLength } from './page-budget.js';
import { InvalidCursorError } from './errors.js';

// Results are grouped by partition, not globally sorted.

type PartitionPage<T> = { items: T[]; nextCursor?: string };

type CompositeCursor = { p: number; k?: string };

const COMPOSITE_PREFIX = 'mp.';

function encodeComposite(cursor: CompositeCursor): string {
  return (
    COMPOSITE_PREFIX +
    Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
  );
}

function decodeComposite(
  cursor: string | undefined,
  partitionCount: number,
): CompositeCursor {
  if (!cursor) return { p: 0 };
  try {
    if (!cursor.startsWith(COMPOSITE_PREFIX)) throw new Error('prefix');
    const parsed = JSON.parse(
      Buffer.from(cursor.slice(COMPOSITE_PREFIX.length), 'base64url').toString(
        'utf8',
      ),
    ) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('shape');
    const { p, k } = parsed as { p?: unknown; k?: unknown };
    if (
      typeof p !== 'number' ||
      !Number.isInteger(p) ||
      p < 0 ||
      p >= partitionCount
    ) {
      throw new Error('partition');
    }
    if (k !== undefined && (typeof k !== 'string' || k.length === 0)) {
      throw new Error('inner');
    }
    return k === undefined ? { p } : { p, k };
  } catch {
    throw new InvalidCursorError();
  }
}

/**
 * `fetchPage` may return fewer items than asked (post-filters or its byte
 * share) as long as `nextCursor` advances. Stops at `limit` items or once the
 * page reaches `byteBudget` JSON bytes, whichever comes first.
 */
export async function walkPartitions<P, T>(
  partitions: readonly P[],
  cursor: string | undefined,
  limit: number,
  fetchPage: (
    partition: P,
    innerCursor: string | undefined,
    remaining: number,
    remainingBytes: number,
  ) => Promise<PartitionPage<T>>,
  byteBudget: number = PAGE_BYTE_BUDGET,
): Promise<{ items: T[]; nextCursor?: string }> {
  let { p, k } = decodeComposite(cursor, partitions.length);
  const items: T[] = [];
  let bytes = 0;
  const full = () => items.length >= limit || bytes >= byteBudget;
  while (p < partitions.length) {
    const remaining = limit - items.length;
    const page = await fetchPage(
      partitions[p]!,
      k,
      remaining,
      byteBudget - bytes,
    );
    for (const item of page.items) bytes += jsonByteLength(item);
    items.push(...page.items);
    if (page.nextCursor) {
      k = page.nextCursor;
      if (full()) {
        return { items, nextCursor: encodeComposite({ p, k }) };
      }
      continue;
    }
    p += 1;
    k = undefined;
    if (full()) {
      return p < partitions.length
        ? { items, nextCursor: encodeComposite({ p }) }
        : { items };
    }
  }
  return { items };
}
