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

// A row dragged sideways in a note nests it; iOS's full-width swipe back would
// take that touch. The swipe from the screen's edge still goes back.
export const noteDetail: NativeStackNavigationOptions = {
  fullScreenGestureEnabled: false,
};
