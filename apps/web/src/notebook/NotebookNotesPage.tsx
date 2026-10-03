import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  useCreateNoteMutation,
  useNotesQuery,
  type NotebookArea,
} from '@gagnechris/app-core';
import { createUlid } from '../lib/ulid';
import { areaQueryParam } from './notebookAreaPreference';
import type { NotebookOutletContext } from './NotebookLayout';

export default function NotebookNotesPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const area = areaQueryParam(areaFilter);

  const notesQuery = useNotesQuery({
    area,
    type: 'page',
    limit: 50,
  });

  const createMutation = useCreateNoteMutation();

  const items = useMemo(() => {
    const all = notesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? all.filter((n) => n.title.toLowerCase().includes(needle))
      : all;
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [notesQuery.data, q]);

  const createPage = async () => {
    const createArea: NotebookArea =
      areaFilter === 'personal' ? 'personal' : 'work';
    const note = await createMutation.mutateAsync({
      id: createUlid(),
      area: createArea,
      type: 'page',
      title: 'Untitled',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
    void navigate(`/notes/${note.id}`);
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h1>Notes</h1>
          <p className="admin-panel__lede">
            Freeform pages
            {areaFilter === 'all'
              ? ' · all areas'
              : areaFilter === 'work'
                ? ' · Work'
                : ' · Personal'}
          </p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={createMutation.isPending}
          onClick={() => void createPage()}
        >
          New page
        </button>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-input"
          type="search"
          placeholder="Search by title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search notes by title"
        />
      </div>

      {notesQuery.isError ? (
        <p className="admin-panel__error" role="alert">
          Could not load notes.
        </p>
      ) : null}

      {notesQuery.isPending ? <p>Loading notes…</p> : null}

      {!notesQuery.isPending && items.length === 0 ? (
        <p className="admin-hint">No pages match.</p>
      ) : (
        <ul className="admin-post-list">
          {items.map((note) => (
            <li key={note.id} className="admin-post-list__item">
              <Link to={`/notes/${note.id}`} className="admin-post-list__link">
                <span className="admin-post-list__title">
                  {note.title.trim() || 'Untitled'}
                  {note.pinned ? (
                    <span className="admin-badge admin-badge--published">
                      Pinned
                    </span>
                  ) : null}
                </span>
                <span className="admin-post-list__meta">
                  {note.area} · {new Date(note.updatedAt).toLocaleString()}
                  {note.tags.length > 0 ? ` · ${note.tags.join(', ')}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {notesQuery.hasNextPage ? (
        <button
          type="button"
          className="admin-btn"
          disabled={notesQuery.isFetchingNextPage}
          onClick={() => void notesQuery.fetchNextPage()}
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}
