import { tokens } from '@gagnechris/tokens';
import { Tabs } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import { color, font } from '../theme';
import { Icon } from './Icon';

export type SpaceTab = {
  name: string;
  title: string;
  icon: SFSymbol;
  hidden?: boolean;
};

export const SpaceTabs = ({ tabs }: { tabs: readonly SpaceTab[] }) => (
  <Tabs
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: color.accent,
      tabBarInactiveTintColor: color.inkSoft,
      tabBarLabelStyle: {
        ...font.medium,
        fontSize: tokens.text.xs - 1,
      },
      tabBarStyle: {
        backgroundColor: color.surface,
        borderTopColor: color.border,
      },
    }}
  >
    {tabs.map(({ name, title, icon, hidden }) => (
      <Tabs.Screen
        key={name}
        name={name}
        options={{
          title,
          href: hidden ? null : undefined,
          tabBarIcon: ({ color: tint }) => (
            <Icon name={icon} size={24} color={tint} />
          ),
        }}
      />
    ))}
  </Tabs>
);
