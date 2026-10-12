import { useMemo, useState } from 'react';
import { usePostsQuery, useProjectsQuery } from '@gagnechris/app-core';
import { useDebouncedValue } from '../kit/useDebouncedValue';
import type { NavPage } from '../workspace/navSections';
import SearchPalette, { type SearchHit } from '../workspace/ui/SearchPalette';

const GROUPS = ['Pages', 'Posts', 'Projects'] as const;

const HITS_PER_GROUP = 8;
const SEARCH_DEBOUNCE_MS = 200;

const matches = (needle: string, ...fields: (string | undefined)[]) =>
  fields.some((f) => f?.toLowerCase().includes(needle));

/** Posts are searched on the server; projects are one short list, matched here. */
export default function AdminSearchPalette({
  pages,
  onClose,
}: {
  pages: readonly NavPage[];
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const postQuery = useDebouncedValue(needle, SEARCH_DEBOUNCE_MS);
  const posts = usePostsQuery(
    { q: postQuery, limit: HITS_PER_GROUP },
    { enabled: postQuery.length > 0 },
  );
  const projects = useProjectsQuery();

  const hits = useMemo((): SearchHit[] => {
    if (!needle) return [];
    const pageHits = pages
      .filter((p) => matches(needle, p.title))
      .map((p): SearchHit => ({
        key: `page-${p.to}`,
        group: 'Pages',
        to: p.to,
        title: p.title,
      }));
    const postHits = (posts.data?.pages[0]?.items ?? [])
      .slice(0, HITS_PER_GROUP)
      .map((p): SearchHit => ({
        key: `post-${p.id}`,
        group: 'Posts',
        to: `/posts/${p.id}`,
        title: (
          <>
            {p.title || 'Untitled'}
            <span className="kit-badge">{p.status}</span>
          </>
        ),
        detail: `/${p.slug}`,
      }));
    const projectHits = (projects.data ?? [])
      .filter((p) => matches(needle, p.name, p.slug))
      .slice(0, HITS_PER_GROUP)
      .map((p): SearchHit => ({
        key: `project-${p.id}`,
        group: 'Projects',
        to: `/projects/${p.id}`,
        title: p.name || 'Untitled',
        detail: `/projects/${p.slug}`,
      }));
    return [...pageHits, ...postHits, ...projectHits];
  }, [needle, pages, posts.data, projects.data]);

  const loading =
    needle !== postQuery || posts.isFetching || projects.isPending;

  return (
    <SearchPalette
      label="Search posts, projects and pages"
      placeholder="Search posts, projects and pages…"
      q={q}
      onQueryChange={setQ}
      groups={GROUPS}
      hits={hits}
      onClose={onClose}
      error={
        posts.isError || projects.isError ? 'Could not load everything.' : null
      }
      status={
        !needle ? (
          <p className="kit-hint">Type to search. Esc to close.</p>
        ) : loading ? (
          <p className="kit-hint">Loading…</p>
        ) : hits.length === 0 ? (
          <p className="kit-hint">No matches.</p>
        ) : null
      }
    />
  );
}
