export type ChipLimits = { maxItems?: number; maxItemLength?: number };

/** Adds comma-separated items from typed text, skipping blanks and case-insensitive duplicates. */
export const addChipItems = (
  items: readonly string[],
  text: string,
  { maxItems = Infinity, maxItemLength }: ChipLimits = {},
): string[] => {
  const next = [...items];
  for (const raw of text.split(',')) {
    const item = raw.trim().slice(0, maxItemLength);
    if (!item || next.length >= maxItems) continue;
    if (next.some((s) => s.toLowerCase() === item.toLowerCase())) continue;
    next.push(item);
  }
  return next;
};
