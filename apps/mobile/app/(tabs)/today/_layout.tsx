import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const TodayStack = () => (
  <Stack screenOptions={largeTitleStack}>
    {/* The date heading and area chip replace the navigation bar. */}
    <Stack.Screen
      name="index"
      options={{ title: 'Today', headerShown: false }}
    />
  </Stack>
);

export default TodayStack;
