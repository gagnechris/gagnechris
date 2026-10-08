import type { NativeStackNavigationOptions } from 'expo-router';
import { color, font } from '../theme';

// No `headerStyle` / `headerLargeStyle` background: with one set, iOS 27 draws
// the bar but not the large title.
export const largeTitleStack: NativeStackNavigationOptions = {
  headerLargeTitleEnabled: true,
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerTitleStyle: { ...font.semibold, color: color.ink },
  headerLargeTitleStyle: { ...font.bold, color: color.ink },
  headerTintColor: color.accent,
  contentStyle: { backgroundColor: color.background },
};
