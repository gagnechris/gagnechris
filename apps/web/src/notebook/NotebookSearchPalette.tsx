import { useState } from 'react';
import {
  SEARCH_TRUNCATED_HINT,
  useDebouncedNotebookSearch,
  useTaskToggle,
} from '@gagnechris/app-core';
import {
  highlightParts,
  notebookAreaName,
  searchHitDetail,
  wordMatches,
  type NotebookArea,
  type NotebookAreaEntry,
  type TextRange,
} from '@gagnechris/shared';
import SearchPalette, { type SearchHit } from '../workspace/ui/SearchPalette';
import { SegmentedRadio } from '@gagnechris/ui';
import { noteHref } from './noteHref';

type Props = {
  onClose: () => void;
  area: NotebookArea;
  areas: readonly NotebookAreaEntry[];
};

type Scope = 'area' | 'all';

const GROUPS = ['Notes', 'Tasks'] as const;
const SCOPE_OPTIONS = [
  { value: 'area', label: 'This area' },
  { value: 'all', label: 'All areas' },
] as const;

function detail(hit: { title: string; snippet: string; matches: TextRange[] }) {
  const text = searchHitDetail(hit);
  return text ? highlight(text, hit.matches) : null;
}

function highlight(text: string, matches: TextRange[]) {
  if (matches.length === 0) return text;
  return highlightParts(text, matches).map((part, i) =>
    part.match ? <mark key={i}>{part.text}</mark> : part.text,
  );
}

export default function NotebookSearchPalette({
  onClose,
  area: current,
  areas,
}: Props) {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('area');
  const area = scope === 'area' ? current : undefined;

  const search = useDebouncedNotebookSearch(q, { area, limit: 12 });
  const { query } = search;
  const { toggle, error: toggleError } = useTaskToggle();

  const hits: SearchHit[] = [];
  const showArea = area === undefined;
  const title = (text: string, hitArea: string) => (
    <>
      <span>{highlight(text, wordMatches(text, query))}</span>
      {showArea ? (
        <span className="kit-badge">{notebookAreaName(areas, hitArea)}</span>
      ) : null}
    </>
  );
  for (const h of search.notes) {
    hits.push({
      key: `note-${h.id}`,
      group: 'Notes',
      to: noteHref({
        id: h.id,
        type: h.date ? 'daily' : 'page',
        date: h.date ?? null,
        area: h.area,
      }),
      title: title(h.title, h.area),
      detail: detail(h),
    });
  }
  for (const { hit: h, live } of search.tasks) {
    hits.push({
      key: `task-${h.id}`,
      group: 'Tasks',
      to: `/tasks/${h.id}`,
      title: title(live?.title ?? h.title, h.area),
      detail: detail(h),
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
        <SegmentedRadio
          label="Search scope"
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={setScope}
          className="workspace-search__scope"
        />
      }
      status={
        <>
          {!q.trim() ? (
            <p className="kit-hint">Type to search. Esc to close.</p>
          ) : null}
          {search.pending ? <p className="kit-hint">Searching…</p> : null}
          {q.trim() && !search.pending && hits.length === 0 ? (
            <p className="kit-hint">No matches.</p>
          ) : null}
          {search.truncated && !search.pending ? (
            <p className="kit-hint">{SEARCH_TRUNCATED_HINT}</p>
          ) : null}
          {search.tasks.length > 0 ? (
            <p className="kit-hint">
              ⌘⏎ / Ctrl+Enter checks off the selected task.
            </p>
          ) : null}
        </>
      }
    />
  );
}
