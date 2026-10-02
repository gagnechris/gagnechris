/**
 * In-memory notebook search helpers (CHR-46).
 */

export type MatchRange = { start: number; end: number };

export type RankedHit = {
  score: number;
  title: string;
  snippet: string;
  matches: MatchRange[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a short snippet around the first case-insensitive match of `q`. */
export function snippetAround(
  text: string,
  q: string,
  radius = 60,
): { snippet: string; matches: MatchRange[] } | undefined {
  const needle = q.trim();
  if (!needle) return undefined;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx < 0) return undefined;

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + needle.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const snippet = `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
  const matchStart = snippet.toLowerCase().indexOf(needle.toLowerCase());
  if (matchStart < 0) {
    return { snippet, matches: [] };
  }
  return {
    snippet,
    matches: [{ start: matchStart, end: matchStart + needle.length }],
  };
}

export function rankTextFields(
  q: string,
  fields: { title: string; body: string; tags: string[] },
): RankedHit | undefined {
  const needle = q.trim().toLowerCase();
  if (!needle) return undefined;

  const title = fields.title;
  const body = fields.body;
  const tags = fields.tags.join(' ');
  const haystacks: Array<{ text: string; weight: number }> = [
    { text: title, weight: 3 },
    { text: tags, weight: 2 },
    { text: body, weight: 1 },
  ];

  let best: RankedHit | undefined;
  for (const { text, weight } of haystacks) {
    if (!text.toLowerCase().includes(needle)) continue;
    const snip = snippetAround(text, q);
    if (!snip) continue;
    const score =
      weight * 10 +
      (text.toLowerCase().startsWith(needle) ? 5 : 0) +
      (new RegExp(`\\b${escapeRegExp(needle)}`, 'i').test(text) ? 2 : 0);
    const hit: RankedHit = {
      score,
      title: title.trim() || 'Untitled',
      snippet: snip.snippet,
      matches: snip.matches,
    };
    if (!best || hit.score > best.score) best = hit;
  }
  return best;
}
