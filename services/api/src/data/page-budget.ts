// Lambda rejects responses over 6 MB, and the proxy result JSON-escapes the
// body a second time, so list and sync pages stop well short of that.
export const PAGE_BYTE_BUDGET = 1_000_000;

export function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/** Resume point for a page cut short after `raw`, the last row consumed. */
export function cursorKeyOf(
  raw: Record<string, unknown>,
  keyNames: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keyNames.map((name) => [name, raw[name]]));
}
