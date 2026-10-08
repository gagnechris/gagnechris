import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const UpcomingStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Upcoming' }} />
  </Stack>
);

export default UpcomingStack;
