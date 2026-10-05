import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreatePostMutation, usePostsQuery } from '@gagnechris/app-core';
import { ApiError } from './query/api';
import { byNewest } from '../kit/byNewest';
import { Button } from '../kit/Button';
import { TextInput, Select } from '../kit/Field';
import { StatusBadge } from '../kit/StatusBadge';

type StatusFilter = 'all' | 'draft' | 'published';
type SortKey = 'updated' | 'published' | 'title';

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export default function AdminPostsPage() {
  const navigate = useNavigate();
  const {
    data,
    error: queryError,
    isPending,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePostsQuery();
  const posts = data?.pages.flatMap((p) => p.items);
  const createMutation = useCreatePostMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('updated');

  const loadError =
    queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Could not load posts.'
        : null;
  const error = actionError ?? loadError;

  const visible = useMemo(() => {
    if (!posts) {
      return [];
    }
    const q = query.trim().toLowerCase();
    let list = posts.filter((p) => {
      if (status !== 'all' && p.status !== status) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sort === 'published') {
        return byNewest(a.publishedAt, b.publishedAt);
      }
      return byNewest(a.updatedAt, b.updatedAt);
    });
    return list;
  }, [posts, query, status, sort]);

  const createDraft = async () => {
    setActionError(null);
    try {
      const data = await createMutation.mutateAsync();
      void navigate(`/posts/${data.id}`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not create draft.',
      );
    }
  };

  const creating = createMutation.isPending;

  return (
    <section className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <h1>Posts</h1>
          <p className="admin-panel__lede">
            Draft and published posts. Click a row to edit.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={creating}
          onClick={() => void createDraft()}
        >
          {creating ? 'Creating…' : 'New post'}
        </Button>
      </div>

      <div className="admin-toolbar">
        <TextInput
          type="search"
          placeholder="Search title, slug, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search posts"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="draft">Drafts</option>
          <option value="published">Published</option>
        </Select>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort posts"
        >
          <option value="updated">Sort by updated</option>
          <option value="published">Sort by published</option>
          <option value="title">Sort by title</option>
        </Select>
      </div>

      {error ? (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {isPending && !error ? <p>Loading…</p> : null}
      {posts && visible.length === 0 ? (
        <p>No posts match. Create a draft to get started.</p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="admin-post-list">
          {visible.map((post) => (
            <li key={post.id}>
              <Link
                to={`/posts/${post.id}`}
                className="admin-post-list__item admin-post-list__link"
              >
                <span className="admin-post-list__title">{post.title}</span>
                <span className="admin-post-list__meta">
                  <StatusBadge status={post.status} />
                  <code>/{post.slug}</code>
                  <span className="admin-post-list__date">
                    {sort === 'published'
                      ? formatDate(post.publishedAt)
                      : formatDate(post.updatedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {hasNextPage ? (
        <Button
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </section>
  );
}
