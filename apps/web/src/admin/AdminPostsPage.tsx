import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  errorMessage,
  useCreatePostMutation,
  usePostsQuery,
} from '@gagnechris/app-core';
import { newPlaceholderSlug } from './placeholderSlug';
import { Button } from '../kit/Button';
import { TextInput } from '../kit/Field';
import { StatusBadge } from '../kit/StatusBadge';
import { useDebouncedValue } from '../kit/useDebouncedValue';
import SegmentedRadio from '../workspace/ui/SegmentedRadio';

type StatusFilter = 'all' | 'draft' | 'published';

const SEARCH_DEBOUNCE_MS = 250;

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
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const q = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const {
    data,
    error: queryError,
    isPending,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePostsQuery({ status: status === 'all' ? undefined : status, q });
  const posts = data?.pages.flatMap((p) => p.items);
  const createMutation = useCreatePostMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const loadError = queryError
    ? errorMessage(queryError, 'Could not load posts.')
    : null;
  const error = actionError ?? loadError;

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
      setActionError(errorMessage(err, 'Could not create draft.'));
    }
  };

  const creating = createMutation.isPending;

  const counts = data?.pages[0]?.counts;

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
            { value: 'all', label: 'All', count: counts?.all },
            { value: 'draft', label: 'Drafts', count: counts?.draft },
            {
              value: 'published',
              label: 'Published',
              count: counts?.published,
            },
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
      </div>

      {error ? (
        <p className="admin-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {isPending && !error ? <p>Loading…</p> : null}
      {posts && posts.length === 0 && !hasNextPage ? (
        <p>
          {q || status !== 'all'
            ? 'No posts match.'
            : 'No posts yet. Create a draft to get started.'}
        </p>
      ) : null}
      {posts && posts.length > 0 ? (
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
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
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
                    {post.status === 'published'
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
