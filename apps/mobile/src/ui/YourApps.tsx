import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '../session';
import { SPACE_HOME, type Space } from '../space';
import { color, font } from '../theme';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
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
export const YourApps = ({ current }: { current: Space | 'site' }) => {
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
          <ListRow
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
      <ListRow
        title="Site"
        divider
        accessibilityLabel={
          current === 'site' ? 'Site, current app' : undefined
        }
        accessibilityHint={
          current === 'site' ? undefined : 'Home, posts and resume'
        }
        leading={
          <AppIcon
            icon="globe"
            tint={current === 'site' ? color.accent : color.inkSoft}
          />
        }
        trailing={
          current === 'site' ? (
            <Text style={styles.current}>Current</Text>
          ) : (
            chevron
          )
        }
        onPress={
          current === 'site' ? undefined : () => router.replace('/site/home')
        }
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
