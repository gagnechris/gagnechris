import {
  ACCESS_LEVEL_LABELS,
  accessLevelFromGroups,
  NOTEBOOK_AREA_LABELS,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useArea } from '../../../src/area';
import { signOutWarning } from '../../../src/cache';
import { displayName, initials, useSession } from '../../../src/session';
import { color, font } from '../../../src/theme';
import { useAreaPicker } from '../../../src/ui/AreaChip';
import { Icon } from '../../../src/ui/Icon';
import { Row } from '../../../src/ui/Row';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';

const MoreScreen = () => {
  const { user, signOut } = useSession();
  const { area } = useArea();
  const pickArea = useAreaPicker();
  if (!user) return null;
  const level = accessLevelFromGroups(user.groups);
  const levelLabel = level ? ACCESS_LEVEL_LABELS[level] : null;
  const name = displayName(user);

  const confirmSignOut = () =>
    Alert.alert('Sign out of Notebook?', signOutWarning(), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen>
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

      <Section
        title="Your apps"
        footer="Only apps you have access to are listed."
      >
        <Row
          title="Notebook"
          accessibilityLabel="Notebook, current app"
          leading={
            <View style={styles.appIcon}>
              <Icon name="book.closed" size={18} color={color.surface} />
            </View>
          }
          trailing={<Text style={styles.current}>Current</Text>}
        />
      </Section>

      <Section title="Notebook">
        <Row
          title="Default area"
          detail={NOTEBOOK_AREA_LABELS[area]}
          accessibilityHint="Chooses Work, Personal or All"
          onPress={pickArea}
          trailing={<Icon name="chevron.right" size={14} color={color.muted} />}
        />
      </Section>

      <Section title="Account">
        <Row
          title="Sign out of Notebook"
          destructive
          onPress={confirmSignOut}
        />
      </Section>
    </Screen>
  );
};

export default MoreScreen;

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
  appIcon: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.md,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.accent,
  },
});
