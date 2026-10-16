import { tokens } from '@gagnechris/tokens';
import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { Icon } from './Icon';

type Props = {
  title: string;
  icon?: SFSymbol;
  children?: string;
  /** An optional Button under the text. */
  action?: ReactNode;
};

export const EmptyState = ({ title, icon, children, action }: Props) => (
  <View style={styles.box}>
    <View
      style={styles.message}
      accessible
      accessibilityLabel={children ? `${title}. ${children}` : title}
    >
      {icon ? (
        <View style={styles.icon}>
          <Icon name={icon} size={24} color={color.accent} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {children ? <Text style={styles.body}>{children}</Text> : null}
    </View>
    {action ? <View style={styles.action}>{action}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    paddingVertical: tokens.space[12],
    paddingHorizontal: tokens.space[4],
  },
  message: { alignItems: 'center', gap: tokens.space[2] },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space[2],
  },
  title: {
    ...font.semibold,
    fontSize: tokens.text.lg,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    ...font.regular,
    fontSize: tokens.text.base,
    lineHeight: 22,
    color: color.inkSoft,
    textAlign: 'center',
  },
  action: { alignSelf: 'stretch', marginTop: tokens.space[4] },
});
