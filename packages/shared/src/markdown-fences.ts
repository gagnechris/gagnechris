const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** A fenced code block by zero-based line: opener, closer (null runs to the end). */
export type FenceBlock = { open: number; close: number | null };

/** One pass over the lines; a closer uses the opener's character, at least as long. */
export function scanFences(lines: Iterable<string>): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let current: { open: number; marker: string } | null = null;
  let i = 0;
  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1];
    if (current) {
      if (
        marker &&
        marker[0] === current.marker[0] &&
        marker.length >= current.marker.length
      ) {
        blocks.push({ open: current.open, close: i });
        current = null;
      }
    } else if (marker) {
      current = { open: i, marker };
    }
    i += 1;
  }
  if (current) blocks.push({ open: current.open, close: null });
  return blocks;
}

/** `fence` for an opener or closer line, `code` inside, null outside any block. */
export function fenceLineKind(
  blocks: readonly FenceBlock[],
  line: number,
): 'fence' | 'code' | null {
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const block = blocks[mid]!;
    if (line < block.open) hi = mid - 1;
    else if (block.close !== null && line > block.close) lo = mid + 1;
    else return line === block.open || line === block.close ? 'fence' : 'code';
  }
  return null;
}
