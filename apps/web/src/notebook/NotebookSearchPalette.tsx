import { useMemo, useState, type ReactNode } from 'react';
import { useNotebookSearchQuery } from '@gagnechris/app-core';
import SearchPalette, { type SearchHit } from '../workspace/ui/SearchPalette';
import { areaQueryParam } from './notebookAreaPreference';
import type { NotebookAreaFilter } from './notebookAreaPreference';

type Props = {
  onClose: () => void;
  areaFilter: NotebookAreaFilter;
};

const GROUPS = ['Notes', 'Tasks'] as const;

function highlight(snippet: string, matches: { start: number; end: number }[]) {
  if (matches.length === 0) return snippet;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [i, m] of matches.entries()) {
    if (m.start > cursor) parts.push(snippet.slice(cursor, m.start));
    parts.push(
      <mark key={`${i}-${m.start}`}>{snippet.slice(m.start, m.end)}</mark>,
    );
    cursor = m.end;
  }
  if (cursor < snippet.length) parts.push(snippet.slice(cursor));
  return parts;
}

export default function NotebookSearchPalette({ onClose, areaFilter }: Props) {
  const [q, setQ] = useState('');
  const [areaOnly, setAreaOnly] = useState(true);
  const area = areaOnly ? areaQueryParam(areaFilter) : undefined;

  const search = useNotebookSearchQuery(
    { q, area, limit: 12 },
    q.trim().length > 0,
  );

  const hits = useMemo((): SearchHit[] => {
    const toHit =
      (group: (typeof GROUPS)[number], path: string) =>
      (h: {
        type: string;
        id: string;
        area: string;
        title: string;
        snippet: string;
        matches: { start: number; end: number }[];
      }): SearchHit => ({
        key: `${h.type}-${h.id}`,
        group,
        to: `/${path}/${h.id}`,
        title: (
          <>
            {h.title}
            <span className="admin-badge">{h.area}</span>
          </>
        ),
        detail: highlight(h.snippet, h.matches),
      });
    return [
      ...(search.data?.notes ?? []).map(toHit('Notes', 'notes')),
      ...(search.data?.tasks ?? []).map(toHit('Tasks', 'tasks')),
    ];
  }, [search.data]);

  return (
    <SearchPalette
      label="Search notes and tasks"
      placeholder="Search notes and tasks…"
      q={q}
      onQueryChange={setQ}
      groups={GROUPS}
      hits={hits}
      onClose={onClose}
      error={search.isError ? 'Search failed.' : null}
      toolbar={
        <label className="admin-check workspace-search__area">
          <input
            type="checkbox"
            checked={areaOnly && areaFilter !== 'all'}
            disabled={areaFilter === 'all'}
            onChange={(e) => setAreaOnly(e.target.checked)}
          />
          Current area only
        </label>
      }
      status={
        <>
          {!q.trim() ? (
            <p className="admin-hint">Type to search. Esc to close.</p>
          ) : null}
          {search.isFetching ? <p className="admin-hint">Searching…</p> : null}
          {q.trim() && !search.isFetching && hits.length === 0 ? (
            <p className="admin-hint">No matches.</p>
          ) : null}
        </>
      }
    />
  );
}
