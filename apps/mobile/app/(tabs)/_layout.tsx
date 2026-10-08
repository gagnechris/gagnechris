import { tokens } from '@gagnechris/tokens';
import type { SFSymbol } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { color, font } from '../../src/theme';
import { Icon } from '../../src/ui/Icon';

const TABS: { name: string; title: string; icon: SFSymbol }[] = [
  { name: 'today', title: 'Today', icon: 'sun.max' },
  { name: 'upcoming', title: 'Upcoming', icon: 'calendar' },
  { name: 'notes', title: 'Notes', icon: 'doc.text' },
  { name: 'tasks', title: 'Tasks', icon: 'checkmark.square' },
  { name: 'more', title: 'More', icon: 'ellipsis' },
];

const TabsLayout = () => (
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
    {TABS.map(({ name, title, icon }) => (
      <Tabs.Screen
        key={name}
        name={name}
        options={{
          title,
          tabBarIcon: ({ color: tint }) => (
            <Icon name={icon} size={24} color={tint} />
          ),
        }}
      />
    ))}
  </Tabs>
);

export default TabsLayout;
