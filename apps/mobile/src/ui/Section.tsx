import { tokens } from '@gagnechris/tokens';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';

export const SectionTitle = ({ title }: { title: string }) => (
  <Text style={styles.title} accessibilityRole="header">
    {title.toUpperCase()}
  </Text>
);

/** A row of a card that a virtualized list draws one row at a time. */
export const CardRow = ({
  first,
  last,
  children,
}: {
  first: boolean;
  last: boolean;
  children: ReactNode;
}) => (
  <View
    style={[styles.cardRow, first && styles.cardTop, last && styles.cardBottom]}
  >
    {children}
  </View>
);

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
    {title ? <SectionTitle title={title} /> : null}
    <View style={styles.card}>{children}</View>
    {footer ? <Text style={styles.footer}>{footer}</Text> : null}
  </View>
);

const CARD_RADIUS = tokens.radius.lg - 4;

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
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  cardRow: { backgroundColor: color.surface, overflow: 'hidden' },
  cardTop: {
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  cardBottom: {
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
  footer: {
    ...font.regular,
    fontSize: tokens.text.caption,
    lineHeight: 18,
    color: color.inkSoft,
    paddingHorizontal: tokens.space[4],
  },
});
