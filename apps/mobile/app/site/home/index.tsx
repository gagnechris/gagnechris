import {
  DEFAULT_HOME,
  HOME_ALL_POSTS_LABEL,
  HOME_RECENT_POSTS_HEADING,
  selectHomeRecentPosts,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  SITE_PROFILE_IMAGE_SRC,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { openMarkdownLink } from '../../../src/markdown/links';
import { siteUrlFor, useSiteHome, useSitePosts } from '../../../src/site/feed';
import {
  LoadError,
  PostPreview,
  siteStyles,
  usePullToRefresh,
} from '../../../src/site/ui';
import { color, font } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { Screen } from '../../../src/ui/Screen';
import { SectionTitle } from '../../../src/ui/Section';

const paragraphs = (about: string) =>
  about
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

const SiteHomeScreen = () => {
  const router = useRouter();
  const home = useSiteHome();
  const posts = useSitePosts();
  const refresh = usePullToRefresh(() =>
    Promise.all([home.refetch(), posts.refetch()]),
  );
  // Before Home's first publish the site shows the bundled default too.
  const { name, title, about } = home.data ?? DEFAULT_HOME;
  const recent = selectHomeRecentPosts(posts.data ?? []);

  return (
    <Screen refreshControl={refresh}>
      <View style={styles.hero}>
        <Image
          source={{ uri: siteUrlFor(SITE_PROFILE_IMAGE_SRC) }}
          style={styles.photo}
          accessibilityIgnoresInvertColors
          accessible
          accessibilityLabel={`Photo of ${name}`}
        />
        <Text style={styles.name} accessibilityRole="header">
          {name}
        </Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {home.isError && !home.data ? <LoadError what="Home" /> : null}
      <View style={styles.about}>
        {paragraphs(about).map((text, i) => (
          <Text key={i} style={siteStyles.body}>
            {text}
          </Text>
        ))}
      </View>
      <View style={styles.links}>
        <Button
          accessibilityHint="Opens in Safari"
          onPress={() => void openMarkdownLink(SITE_LINKEDIN_URL)}
        >
          LinkedIn
        </Button>
        <Button
          accessibilityHint="Opens in Safari"
          onPress={() => void openMarkdownLink(SITE_GITHUB_URL)}
        >
          GitHub
        </Button>
      </View>
      <View style={styles.section}>
        <SectionTitle title={HOME_RECENT_POSTS_HEADING} />
        {posts.isError && !posts.data ? <LoadError what="posts" /> : null}
        {recent.map((post) => (
          <PostPreview
            key={post.id}
            post={post}
            onPress={() => router.push(`/site/home/${post.slug}`)}
          />
        ))}
        {recent.length > 0 ? (
          <Button onPress={() => router.navigate('/site/posts')}>
            {HOME_ALL_POSTS_LABEL}
          </Button>
        ) : null}
      </View>
    </Screen>
  );
};

export default SiteHomeScreen;

const PHOTO = 112;

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: tokens.space[2],
    paddingTop: tokens.space[6],
  },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: PHOTO / 2,
    backgroundColor: color.fill,
    marginBottom: tokens.space[2],
  },
  name: {
    ...font.bold,
    fontSize: tokens.text['2xl'],
    color: color.ink,
    textAlign: 'center',
  },
  title: {
    ...font.medium,
    fontSize: tokens.text.body,
    color: color.inkSoft,
    textAlign: 'center',
  },
  about: { gap: tokens.space[3] },
  links: { flexDirection: 'row', gap: tokens.space[3] },
  section: { gap: tokens.space[2] },
});
