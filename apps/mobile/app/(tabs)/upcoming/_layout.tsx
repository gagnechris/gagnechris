import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const detail = { headerLargeTitleEnabled: false, headerBackTitle: 'Upcoming' };

const UpcomingStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Upcoming' }} />
    <Stack.Screen name="task/[id]" options={detail} />
    <Stack.Screen name="note/[id]" options={detail} />
  </Stack>
);

export default UpcomingStack;
