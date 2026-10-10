import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

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
