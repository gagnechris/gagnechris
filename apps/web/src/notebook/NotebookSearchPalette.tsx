import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useCachedTasks,
  useNotebookSearchQuery,
  useTaskToggle,
} from '@gagnechris/app-core';
import SearchPalette, { type SearchHit } from '../workspace/ui/SearchPalette';
import SegmentedRadio from '../workspace/ui/SegmentedRadio';
import { areaQueryParam } from './notebookAreaPreference';
import type { NotebookAreaFilter } from './notebookAreaPreference';

type Props = {
  onClose: () => void;
  areaFilter: NotebookAreaFilter;
};

type Range = { start: number; end: number };
type Scope = 'area' | 'all';

const GROUPS = ['Notes', 'Tasks'] as const;
const SEARCH_DEBOUNCE_MS = 200;
const SCOPE_OPTIONS = [
  { value: 'area', label: 'This area' },
  { value: 'all', label: 'All areas' },
] as const;

function highlight(text: string, matches: Range[]) {
  if (matches.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [i, m] of matches.entries()) {
    if (m.start < cursor) continue;
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    parts.push(
      <mark key={`${i}-${m.start}`}>{text.slice(m.start, m.end)}</mark>,
    );
    cursor = m.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** The query's words in `text`, case-insensitive, in order. */
function wordMatches(text: string, q: string): Range[] {
  const lower = text.toLowerCase();
  const ranges: Range[] = [];
  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    for (
      let at = lower.indexOf(word);
      at !== -1;
      at = lower.indexOf(word, at + word.length)
    ) {
      ranges.push({ start: at, end: at + word.length });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export default function NotebookSearchPalette({ onClose, areaFilter }: Props) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);
  const typing = q.trim() !== query.trim();
  const [scope, setScope] = useState<Scope>('area');
  const area = scope === 'area' ? areaQueryParam(areaFilter) : undefined;

  const search = useNotebookSearchQuery(
    { q: query, area, limit: 12 },
    query.trim().length > 0,
  );
  const taskIds = useMemo(
    () => (search.data?.tasks ?? []).map((t) => t.id),
    [search.data],
  );
  // Hits carry status; a check-off made here updates the cached task first.
  const cachedTasks = useCachedTasks(taskIds);
  const { toggle, error: toggleError } = useTaskToggle();

  const hits: SearchHit[] = [];
  const showArea = area === undefined;
  const title = (text: string, hitArea: string) => (
    <>
      <span>{highlight(text, wordMatches(text, query))}</span>
      {showArea ? <span className="admin-badge">{hitArea}</span> : null}
    </>
  );
  for (const h of search.data?.notes ?? []) {
    hits.push({
      key: `note-${h.id}`,
      group: 'Notes',
      // A daily note is written on Today, which keeps its date and area.
      to: h.date ? `/today?date=${h.date}&area=${h.area}` : `/notes/${h.id}`,
      title: title(h.title, h.area),
      detail: highlight(h.snippet, h.matches),
    });
  }
  for (const [i, h] of (search.data?.tasks ?? []).entries()) {
    const cached = cachedTasks[i]?.data;
    const live =
      cached && !cached.deleted
        ? cached
        : h.status !== undefined && h.version !== undefined
          ? { id: h.id, title: h.title, status: h.status, version: h.version }
          : undefined;
    hits.push({
      key: `task-${h.id}`,
      group: 'Tasks',
      to: `/tasks/${h.id}`,
      title: title(live?.title ?? h.title, h.area),
      detail: highlight(h.snippet, h.matches),
      check: live
        ? {
            checked: live.status === 'done',
            label: live.status === 'done' ? 'done' : 'open',
            onToggle: () => void toggle(live),
          }
        : undefined,
    });
  }

  return (
    <SearchPalette
      label="Search notes and tasks"
      placeholder="Search notes and tasks…"
      q={q}
      onQueryChange={setQ}
      groups={GROUPS}
      hits={hits}
      onClose={onClose}
      error={search.isError ? 'Search failed.' : (toggleError ?? null)}
      toolbar={
        areaFilter === 'all' ? null : (
          <SegmentedRadio
            label="Search scope"
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={setScope}
            className="workspace-search__scope"
          />
        )
      }
      status={
        <>
          {!q.trim() ? (
            <p className="admin-hint">Type to search. Esc to close.</p>
          ) : null}
          {typing || search.isFetching ? (
            <p className="admin-hint">Searching…</p>
          ) : null}
          {q.trim() && !typing && !search.isFetching && hits.length === 0 ? (
            <p className="admin-hint">No matches.</p>
          ) : null}
          {taskIds.length > 0 ? (
            <p className="admin-hint">
              ⌘⏎ / Ctrl+Enter checks off the selected task.
            </p>
          ) : null}
        </>
      }
    />
  );
}
