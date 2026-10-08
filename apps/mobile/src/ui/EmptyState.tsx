import { tokens } from '@gagnechris/tokens';
import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { Icon } from './Icon';

export const EmptyState = ({
  icon,
  title,
  body,
}: {
  icon: SFSymbol;
  title: string;
  body: string;
}) => (
  <View style={styles.box} accessible accessibilityLabel={`${title}. ${body}`}>
    <View style={styles.icon}>
      <Icon name={icon} size={24} color={color.accent} />
    </View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body}</Text>
  </View>
);

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: tokens.space[2],
    paddingVertical: tokens.space[12],
    paddingHorizontal: tokens.space[4],
  },
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
});
