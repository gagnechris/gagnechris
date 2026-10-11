import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

// A detail opened from search, conflicts or a link gets the list under it.
export const unstable_settings = { anchor: 'index' };

const detail = { headerLargeTitleEnabled: false, headerBackTitle: 'Today' };

const TodayStack = () => (
  <Stack screenOptions={largeTitleStack}>
    {/* The date heading and area chip replace the navigation bar. */}
    <Stack.Screen
      name="index"
      options={{ title: 'Today', headerShown: false }}
    />
    <Stack.Screen name="task/[id]" options={detail} />
    <Stack.Screen name="note/[id]" options={detail} />
  </Stack>
);

export default TodayStack;
