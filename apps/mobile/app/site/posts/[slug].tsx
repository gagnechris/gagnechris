import {
  formatPostDate,
  POST_META_SEPARATOR,
  POST_PART_OF_LABEL,
  postPartOfSeparator,
  postPartOfSuffix,
  readingTimeLabel,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import {
  openMarkdownLink,
  PUBLIC_SITE_ORIGIN,
} from '../../../src/markdown/links';
import { MarkdownView } from '../../../src/markdown/MarkdownView';
import { SiteNotFound, siteUrlFor, useSitePost } from '../../../src/site/feed';
import { LoadError, siteStyles, usePullToRefresh } from '../../../src/site/ui';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Icon } from '../../../src/ui/Icon';
import { Screen } from '../../../src/ui/Screen';

/** `/posts/<slug>` on the public site, or null. */
const postSlugOf = (href: string): string | null => {
  const path = href.startsWith(PUBLIC_SITE_ORIGIN)
    ? href.slice(PUBLIC_SITE_ORIGIN.length)
    : href;
  return /^\/posts\/([a-z0-9-]+)\/?$/.exec(path)?.[1] ?? null;
};

const SitePostScreen = () => {
  const router = useRouter();
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const post = useSitePost(slug);
  const refresh = usePullToRefresh(() => post.refetch());
  const url = siteUrlFor(`/posts/${slug}`);
  const data = post.data;

  const openLink = (href: string) => {
    const other = postSlugOf(href);
    if (other) router.push(`/site/posts/${other}`);
    else void openMarkdownLink(href, PUBLIC_SITE_ORIGIN);
  };

  return (
    <Screen refreshControl={refresh}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share post"
              onPress={() =>
                void Share.share({ url, message: data?.title ?? url })
              }
              style={styles.headerButton}
            >
              <Icon name="square.and.arrow.up" size={22} color={color.accent} />
            </Pressable>
          ),
        }}
      />
      {post.error instanceof SiteNotFound ? (
        <EmptyState
          icon="doc.text"
          title="Post not found"
          body="It may have been unpublished."
        />
      ) : post.isError && !data ? (
        <LoadError what="this post" />
      ) : null}
      {data ? (
        <>
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">
              {data.title}
            </Text>
            <Text style={siteStyles.muted}>
              {[
                formatPostDate(data.publishedAt),
                readingTimeLabel(data.minutes),
              ]
                .filter(Boolean)
                .join(POST_META_SEPARATOR)}
            </Text>
            {data.partOf.length > 0 ? (
              <Text style={siteStyles.muted}>
                {POST_PART_OF_LABEL}{' '}
                {data.partOf.map((project, i) => (
                  <Text key={project.name}>
                    {postPartOfSeparator(i, data.partOf.length)}
                    {project.href ? (
                      <Text
                        accessibilityRole="link"
                        style={siteStyles.link}
                        onPress={() => openLink(project.href!)}
                      >
                        {project.name}
                      </Text>
                    ) : (
                      project.name
                    )}
                  </Text>
                ))}
                {postPartOfSuffix(data.partOf.length)}
              </Text>
            ) : null}
          </View>
          <MarkdownView
            markdown={data.bodyMarkdown}
            siteOrigin={PUBLIC_SITE_ORIGIN}
            onLinkPress={openLink}
          />
        </>
      ) : null}
    </Screen>
  );
};

export default SitePostScreen;

const styles = StyleSheet.create({
  head: { gap: tokens.space[2], paddingTop: tokens.space[2] },
  title: {
    ...font.bold,
    fontSize: tokens.text['2xl'],
    lineHeight: 34,
    color: color.ink,
  },
  headerButton: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
