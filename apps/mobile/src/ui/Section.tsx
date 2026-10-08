import { tokens } from '@gagnechris/tokens';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';

export const Section = ({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) => (
  <View style={styles.section}>
    {title ? (
      <Text style={styles.title} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
    ) : null}
    <View style={styles.card}>{children}</View>
    {footer ? <Text style={styles.footer}>{footer}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  section: { gap: tokens.space[2] },
  title: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    letterSpacing: 0.6,
    color: color.inkSoft,
    paddingHorizontal: tokens.space[4],
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: tokens.radius.lg - 4,
    overflow: 'hidden',
  },
  footer: {
    ...font.regular,
    fontSize: tokens.text.caption,
    lineHeight: 18,
    color: color.inkSoft,
    paddingHorizontal: tokens.space[4],
  },
});
