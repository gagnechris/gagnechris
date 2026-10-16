import {
  groupPostsByYear,
  POSTS_INDEX_EMPTY_TEXT,
  POSTS_INDEX_INTRO,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSitePosts } from '../../../src/site/feed';
import {
  LoadError,
  PostPreview,
  siteStyles,
  usePullToRefresh,
} from '../../../src/site/ui';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Screen } from '../../../src/ui/Screen';
import { SectionTitle } from '../../../src/ui/Section';

const SitePostsScreen = () => {
  const router = useRouter();
  const posts = useSitePosts();
  const refresh = usePullToRefresh(() => posts.refetch());
  const years = groupPostsByYear(posts.data ?? []);

  return (
    <Screen refreshControl={refresh}>
      <Text style={siteStyles.muted}>{POSTS_INDEX_INTRO}</Text>
      {posts.isError && !posts.data ? <LoadError what="posts" /> : null}
      {posts.data && years.length === 0 ? (
        <EmptyState icon="doc.text" title="No posts">
          {POSTS_INDEX_EMPTY_TEXT}
        </EmptyState>
      ) : null}
      {years.map(({ year, posts: items }) => (
        <View key={year} style={styles.year}>
          <SectionTitle title={year} />
          {items.map((post) => (
            <PostPreview
              key={post.id}
              post={post}
              onPress={() => router.push(`/site/posts/${post.slug}`)}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
};

export default SitePostsScreen;

const styles = StyleSheet.create({
  year: { gap: tokens.space[2] },
});
