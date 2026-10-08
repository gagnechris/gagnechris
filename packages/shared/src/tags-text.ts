/** `a, b ,, c` → `['a', 'b', 'c']`. */
export const parseTagsText = (tagsText: string): string[] =>
  tagsText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
