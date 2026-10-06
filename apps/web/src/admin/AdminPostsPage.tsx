import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreatePostMutation, usePostsQuery } from '@gagnechris/app-core';
import { ApiError } from './query/api';
import { newPlaceholderSlug } from './placeholderSlug';
import { byNewest } from '../kit/byNewest';
import { Button } from '../kit/Button';
import { TextInput, Select } from '../kit/Field';
import { StatusBadge } from '../kit/StatusBadge';
import SegmentedRadio from '../workspace/ui/SegmentedRadio';

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
      const data = await createMutation.mutateAsync({
        title: 'Untitled',
        slug: newPlaceholderSlug('untitled'),
        excerpt: '',
        bodyMarkdown: '',
        tags: [],
        projectIds: [],
      });
      void navigate(`/posts/${data.id}`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not create draft.',
      );
    }
  };

  const creating = createMutation.isPending;

  const counts = {
    all: posts?.length ?? 0,
    draft: posts?.filter((p) => p.status === 'draft').length ?? 0,
    published: posts?.filter((p) => p.status === 'published').length ?? 0,
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel__header admin-page-header">
        <div>
          <p className="admin-eyebrow">Site</p>
          <h1>Posts</h1>
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
        <SegmentedRadio
          label="Filter by status"
          className="admin-status-filter"
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'draft', label: 'Drafts', count: counts.draft },
            { value: 'published', label: 'Published', count: counts.published },
          ]}
          value={status}
          onChange={setStatus}
        />
        <div className="admin-search">
          <svg
            className="admin-search__icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <TextInput
            type="search"
            placeholder="Search title, slug, tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search posts"
          />
        </div>
        <label className="admin-sort">
          Sort
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="updated">Last updated</option>
            <option value="published">Published date</option>
            <option value="title">Title</option>
          </Select>
        </label>
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
        <div className="admin-table-box">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col" className="admin-table__status">
                  Status
                </th>
                <th scope="col" className="admin-table__slug">
                  Slug
                </th>
                <th scope="col" className="admin-table__date">
                  {sort === 'published' ? 'Published' : 'Updated'}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((post) => (
                <tr key={post.id}>
                  <td>
                    <Link
                      to={`/posts/${post.id}`}
                      className="admin-table__link"
                    >
                      <span className="admin-table__title">{post.title}</span>
                      {post.tags?.length ? (
                        <span className="admin-table__sub">
                          {post.tags.join(', ')}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td>
                    <span className="admin-table__badges">
                      <StatusBadge
                        status={post.status}
                        hasUnpublishedChanges={post.hasUnpublishedChanges}
                      />
                    </span>
                  </td>
                  <td className="admin-table__slug">/{post.slug}</td>
                  <td className="admin-table__date">
                    {sort === 'published'
                      ? formatDate(post.publishedAt)
                      : formatDate(post.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {hasNextPage ? (
        <Button
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
      <p className="admin-hint">
        Publishing regenerates the post page, RSS and sitemap.
      </p>
    </section>
  );
}
