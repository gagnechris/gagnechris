import {
  newPlaceholderSlug,
  usePostsQuery,
  useCreatePostMutation,
} from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, Text } from 'react-native';
import { postMeta } from '../../../src/admin/labels';
import { ContentRow } from '../../../src/admin/ContentRow';
import { color, font } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { showError } from '../../../src/ui/confirm';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Icon } from '../../../src/ui/Icon';
import { IconButton } from '../../../src/ui/IconButton';
import { Screen } from '../../../src/ui/Screen';
import { SearchInput } from '../../../src/ui/SearchInput';
import { Section } from '../../../src/ui/Section';
import { SegmentedRadio, segmentOptions } from '../../../src/ui/SegmentedRadio';

const STATUSES = ['all', 'draft', 'published'] as const;
type StatusFilter = (typeof STATUSES)[number];
const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  draft: 'Drafts',
  published: 'Published',
};

const PostsScreen = () => {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const posts = usePostsQuery({
    status: status === 'all' ? undefined : status,
    q,
  });
  const create = useCreatePostMutation();
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = posts.data?.pages[0]?.counts;
  const labels = counts
    ? {
        all: `All ${counts.all}`,
        draft: `Drafts ${counts.draft}`,
        published: `Published ${counts.published}`,
      }
    : STATUS_LABELS;

  const open = (id: string) => router.push(`/admin/posts/${id}`);

  const newPost = async () => {
    try {
      const post = await create.mutateAsync({
        title: 'Untitled',
        slug: newPlaceholderSlug('untitled'),
        excerpt: '',
        bodyMarkdown: '',
        tags: [],
        projectIds: [],
      });
      open(post.id);
    } catch {
      showError(
        'Could not create a post',
        'Check your connection and try again.',
      );
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await posts.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = q.trim() !== '' || status !== 'all';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      }
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              size="lg"
              label="New post"
              disabled={create.isPending}
              onPress={() => void newPost()}
            >
              <Icon name="square.and.pencil" size={22} color={color.accent} />
            </IconButton>
          ),
        }}
      />
      <SearchInput
        placeholder="Search title, slug, tags"
        value={q}
        onValueChange={setQ}
      />
      <SegmentedRadio
        label="Post status"
        options={segmentOptions(STATUSES, labels)}
        value={status}
        onChange={setStatus}
      />
      {posts.isError && items.length === 0 ? (
        <Text style={styles.status} accessibilityRole="alert">
          Could not load posts. Pull to try again.
        </Text>
      ) : items.length === 0 ? (
        posts.isPending ? (
          <Text style={styles.status}>Loading posts…</Text>
        ) : filtered ? (
          <Text style={styles.status}>No posts match.</Text>
        ) : (
          <EmptyState icon="square.and.pencil" title="No posts yet">
            Start a draft with the compose button. It stays private until you
            publish it.
          </EmptyState>
        )
      ) : (
        <>
          <Section>
            {items.map((post, index) => (
              <ContentRow
                key={post.id}
                title={post.title}
                meta={postMeta(post)}
                tags={post.tags}
                divider={index > 0}
                onPress={() => open(post.id)}
              />
            ))}
          </Section>
          {posts.hasNextPage ? (
            <Button
              disabled={posts.isFetchingNextPage}
              onPress={() => void posts.fetchNextPage()}
            >
              {posts.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </>
      )}
      <Text style={styles.hint}>
        Publishing regenerates the post page, RSS and sitemap.
      </Text>
    </Screen>
  );
};

export default PostsScreen;

const styles = StyleSheet.create({
  status: {
    ...font.regular,
    fontSize: 15,
    color: color.inkSoft,
    textAlign: 'center',
    paddingVertical: 24,
  },
  hint: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.muted,
    textAlign: 'center',
    paddingTop: tokens.space[4],
  },
});
