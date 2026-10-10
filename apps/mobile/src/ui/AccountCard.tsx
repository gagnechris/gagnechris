import { ACCESS_LEVEL_LABELS, accessLevelFromGroups } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { StyleSheet, Text, View } from 'react-native';
import { displayName, initials, type SessionUser } from '../session';
import { color, font } from '../theme';

export const AccountCard = ({ user }: { user: SessionUser }) => {
  const level = accessLevelFromGroups(user.groups);
  const levelLabel = level ? ACCESS_LEVEL_LABELS[level] : null;
  const name = displayName(user);
  return (
    <View
      style={styles.account}
      accessible
      accessibilityLabel={[
        name,
        user.email !== name ? user.email : null,
        levelLabel,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials(user)}</Text>
      </View>
      <View style={styles.accountText}>
        <Text style={styles.name}>{name}</Text>
        {user.email !== name ? (
          <Text style={styles.email}>{user.email}</Text>
        ) : null}
        {levelLabel ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{levelLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[4],
    padding: tokens.space[4],
    backgroundColor: color.surface,
    borderRadius: tokens.radius.lg - 4,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    ...font.bold,
    fontSize: tokens.text.lg,
    color: color.accentInk,
  },
  accountText: { flex: 1, gap: 2, alignItems: 'flex-start' },
  name: { ...font.bold, fontSize: tokens.text.xl, color: color.ink },
  email: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  badge: {
    marginTop: tokens.space[1],
    backgroundColor: color.ink,
    borderRadius: tokens.radius.sm + 2,
    paddingHorizontal: tokens.space[2],
    paddingVertical: 2,
  },
  badgeText: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    color: color.surface,
  },
});
