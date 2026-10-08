import { tokens } from '@gagnechris/tokens';
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, type RefreshControlProps } from 'react-native';
import { color } from '../theme';

/** `automatic` insets let the native large title collapse on scroll. */
export const Screen = ({
  children,
  refreshControl,
}: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}) => (
  <ScrollView
    refreshControl={refreshControl}
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="handled"
    style={styles.scroll}
    contentContainerStyle={styles.content}
    contentInsetAdjustmentBehavior="automatic"
  >
    {children}
  </ScrollView>
);

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.background },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[8],
    gap: tokens.space[4],
  },
});
