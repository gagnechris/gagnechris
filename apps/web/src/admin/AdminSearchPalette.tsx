import { useMemo, useState } from 'react';
import { usePostsQuery, useProjectsQuery } from '@gagnechris/app-core';
import SearchPalette, { type SearchHit } from '../workspace/ui/SearchPalette';

const GROUPS = ['Pages', 'Posts', 'Projects'] as const;

const PAGES = [
  { to: '/', title: 'Posts' },
  { to: '/home', title: 'Home page' },
  { to: '/resume', title: 'Resume' },
  { to: '/projects', title: 'Projects' },
];

const matches = (needle: string, ...fields: (string | undefined)[]) =>
  fields.some((f) => f?.toLowerCase().includes(needle));

/** Searches the posts and projects lists already loaded for their pages. */
export default function AdminSearchPalette({
  onClose,
}: {
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const posts = usePostsQuery();
  const projects = useProjectsQuery();
  const needle = q.trim().toLowerCase();

  const hits = useMemo((): SearchHit[] => {
    if (!needle) return [];
    const pages = PAGES.filter((p) => matches(needle, p.title)).map(
      (p): SearchHit => ({
        key: `page-${p.to}`,
        group: 'Pages',
        to: p.to,
        title: p.title,
      }),
    );
    const postHits = (posts.data?.pages.flatMap((p) => p.items) ?? [])
      .filter((p) => matches(needle, p.title, p.slug, ...(p.tags ?? [])))
      .slice(0, 8)
      .map((p): SearchHit => ({
        key: `post-${p.id}`,
        group: 'Posts',
        to: `/posts/${p.id}`,
        title: (
          <>
            {p.title || 'Untitled'}
            <span className="admin-badge">{p.status}</span>
          </>
        ),
        detail: `/${p.slug}`,
      }));
    const projectHits = (projects.data ?? [])
      .filter((p) => matches(needle, p.name, p.slug))
      .slice(0, 8)
      .map((p): SearchHit => ({
        key: `project-${p.id}`,
        group: 'Projects',
        to: `/projects/${p.id}`,
        title: p.name || 'Untitled',
        detail: `/projects/${p.slug}`,
      }));
    return [...pages, ...postHits, ...projectHits];
  }, [needle, posts.data, projects.data]);

  const loading = posts.isPending || projects.isPending;

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
          <p className="admin-hint">Type to search. Esc to close.</p>
        ) : loading ? (
          <p className="admin-hint">Loading…</p>
        ) : hits.length === 0 ? (
          <p className="admin-hint">No matches.</p>
        ) : null
      }
    />
  );
}
