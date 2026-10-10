import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../session';
import { SPACE_HOME, type Space } from '../space';
import { color, font } from '../theme';
import { Icon } from './Icon';
import { Row } from './Row';
import { Section } from './Section';

const APPS: Record<Space, { title: string; detail: string; icon: SFSymbol }> = {
  notebook: {
    title: 'Notebook',
    detail: 'Notes and tasks',
    icon: 'book.closed',
  },
  admin: {
    title: 'Admin',
    detail: 'Posts, pages, projects, users',
    icon: 'square.and.pencil',
  },
};

const AppIcon = ({ icon, tint }: { icon: SFSymbol; tint: string }) => (
  <View style={[styles.appIcon, { backgroundColor: tint }]}>
    <Icon name={icon} size={18} color={color.surface} />
  </View>
);

const chevron = <Icon name="chevron.right" size={14} color={color.muted} />;

/** The spaces the user can open, with `current` marked; the others switch the tab bar. */
export const YourApps = ({ current }: { current: Space }) => {
  const { spaces } = useSession();
  const router = useRouter();
  return (
    <Section
      title="Your apps"
      footer="Only apps you have access to are listed."
    >
      {spaces.map((space, index) => {
        const app = APPS[space];
        const isCurrent = space === current;
        return (
          <Row
            key={space}
            title={app.title}
            divider={index > 0}
            accessibilityLabel={
              isCurrent ? `${app.title}, current app` : app.title
            }
            accessibilityHint={isCurrent ? undefined : app.detail}
            leading={
              <AppIcon
                icon={app.icon}
                tint={isCurrent ? color.accent : color.ink}
              />
            }
            trailing={
              isCurrent ? <Text style={styles.current}>Current</Text> : chevron
            }
            onPress={
              isCurrent ? undefined : () => router.replace(SPACE_HOME[space])
            }
          />
        );
      })}
      <Row
        title="Public site"
        divider
        accessibilityHint="Opens gagnechris.com in Safari"
        leading={<AppIcon icon="globe" tint={color.inkSoft} />}
        trailing={<Icon name="arrow.up.right" size={14} color={color.muted} />}
        onPress={() => void Linking.openURL('https://gagnechris.com')}
      />
    </Section>
  );
};

const styles = StyleSheet.create({
  appIcon: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: {
    ...font.semibold,
    fontSize: tokens.text.base,
    color: color.accent,
  },
});
