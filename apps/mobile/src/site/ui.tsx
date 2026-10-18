import { formatPostDate } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useState, type ReactElement } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Excerpt } from '../ui/Excerpt';
import { PressArea } from '../ui/PressArea';

export type PostPreviewItem = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
};

/** A post as the public lists show it: date, title, excerpt. */
export const PostPreview = ({
  post,
  onPress,
}: {
  post: PostPreviewItem;
  onPress: () => void;
}) => {
  const date = formatPostDate(post.publishedAt);
  return (
    <PressArea
      accessibilityRole="link"
      accessibilityLabel={[post.title, date].filter(Boolean).join(', ')}
      accessibilityHint={post.excerpt || undefined}
      onPress={onPress}
      style={styles.preview}
    >
      {date ? <Text style={styles.date}>{date}</Text> : null}
      <Text style={styles.title}>{post.title}</Text>
      {post.excerpt ? (
        <Excerpt lines={3} style={styles.excerpt}>
          {post.excerpt}
        </Excerpt>
      ) : null}
    </PressArea>
  );
};

/** What a screen shows when the published JSON didn't load. */
export const LoadError = ({ what }: { what: string }) => (
  <Text style={styles.error} accessibilityRole="alert">
    Couldn’t load {what}. Pull down to try again.
  </Text>
);

/** Pull to refresh that spins only while the user's pull is in flight. */
export function usePullToRefresh(
  refetch: () => Promise<unknown>,
): ReactElement<RefreshControlProps> {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    />
  );
}

export const Card = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.card}>{children}</View>
);

export const siteStyles = StyleSheet.create({
  heading: {
    ...font.bold,
    fontSize: tokens.text.xl,
    color: color.ink,
  },
  body: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: 26,
    color: color.ink,
  },
  muted: {
    ...font.regular,
    fontSize: tokens.text.base,
    lineHeight: 22,
    color: color.inkSoft,
  },
  link: {
    ...font.medium,
    color: color.accent,
  },
});

const styles = StyleSheet.create({
  preview: {
    minHeight: MIN_TARGET,
    gap: tokens.space[1],
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    backgroundColor: color.surface,
    borderRadius: tokens.radius.lg - 4,
  },
  date: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.muted,
  },
  title: {
    ...font.semibold,
    fontSize: tokens.text.lg,
    lineHeight: 26,
    color: color.ink,
  },
  excerpt: {
    ...font.regular,
    fontSize: tokens.text.base,
    lineHeight: 22,
    color: color.inkSoft,
  },
  error: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.alert,
    paddingVertical: tokens.space[4],
  },
  card: {
    gap: tokens.space[3],
    padding: tokens.space[4],
    backgroundColor: color.surface,
    borderRadius: tokens.radius.lg - 4,
  },
});
