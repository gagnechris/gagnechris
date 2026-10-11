import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

// A screen opened from a link gets the list under it.
export const unstable_settings = { anchor: 'index' };

const PagesStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Pages' }} />
    <Stack.Screen
      name="home"
      options={{
        title: 'Home page',
        headerLargeTitleEnabled: false,
        headerBackTitle: 'Pages',
      }}
    />
    <Stack.Screen
      name="resume"
      options={{
        title: 'Resume',
        headerLargeTitleEnabled: false,
        headerBackTitle: 'Pages',
      }}
    />
  </Stack>
);

export default PagesStack;
